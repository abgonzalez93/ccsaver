import assert from "node:assert/strict"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import { troubleOf } from "../../src/delegation/fallback.client.ts"
import {
  CLI,
  type FakeServer,
  fakeClaude,
  type Ran,
  run,
  startServer,
  tempDir,
  writeHome,
} from "../test.helpers.ts"

const HOME = tempDir("fallback-home")
const BARE_HOME = tempDir("fallback-bare")
const PINNED_HOME = tempDir("fallback-pinned")
const OFF_HOME = tempDir("fallback-off")
const WORK = tempDir("fallback-work")
const OUTSIDE = tempDir("fallback-outside")
const PROJECT = join(WORK, "project")
const SOURCE = join(PROJECT, "source.ts")
const FAKE = fakeClaude(WORK)
const PLUGGED = [[PROJECT]]

let server: FakeServer

const cli = (args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): Promise<Ran> =>
  run("node", [CLI, ...args], { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env }, "", cwd)

const bulkRead = (path: string, env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  cli(["bulk-read", "--project", PROJECT, "--question", "q", "--paths", path], env)

before(async () => {
  server = await startServer()
  mkdirSync(PROJECT, { recursive: true })
  writeFileSync(SOURCE, "export const a = 1\nexport const b = 2\n")
  const worker = { url: server.url, model: "cheap-1" }
  writeHome(HOME, { plugged: PLUGGED, worker, key: "k-test" })
  writeHome(BARE_HOME, { plugged: PLUGGED })
  writeHome(PINNED_HOME, {
    plugged: PLUGGED,
    worker: { ...worker, claude: fakeClaude(WORK, "pinned", "FROM-PINNED") },
    key: "k-test",
  })
  writeHome(OFF_HOME, { plugged: PLUGGED, worker: { ...worker, fallback: false }, key: "k-test" })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, BARE_HOME, PINNED_HOME, OFF_HOME, WORK, OUTSIDE])
    rmSync(dir, { recursive: true, force: true })
})

test("refuses to send the paid fallback more than its context window holds", async () => {
  const huge = join(OUTSIDE, "huge.md")
  writeFileSync(huge, "x".repeat(400_001))
  const out = await bulkRead(huge)
  assert.equal(out.code, 1)
  assert.equal(out.stdout, "")
  assert.match(
    out.stderr,
    /^Error: the files are ~\d+ tokens by chars\/4, over the 100000 the Haiku/m,
  )
})

test("uses the Claude worker when no external model is configured, and says so first", async () => {
  const before = server.seen.length
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: BARE_HOME })
  assert.match(out.stdout, /FROM-CLAUDE/)
  assert.match(
    out.stderr,
    /^\[ccsaver: no worker is set \(ccsaver worker set <url> <model>\), falling back\]$/m,
  )
  assert.equal(server.seen.length, before)
})

test("the fallback binary pinned in worker.json wins over the environment", async () => {
  const hidden = join(OUTSIDE, "elsewhere.ts")
  writeFileSync(hidden, "export const elsewhere = 1\n")
  assert.match((await bulkRead(hidden, { CCSAVER_HOME: PINNED_HOME })).stdout, /FROM-PINNED/)
})

test("with the fallback off, a call the worker cannot take fails and nothing reaches Claude", async () => {
  server.reply.status = 429
  const refused = await bulkRead(SOURCE, { CCSAVER_HOME: OFF_HOME })
  assert.equal(refused.code, 1)
  assert.equal(refused.stdout, "")
  assert.match(
    refused.stderr,
    /^\[ccsaver: cheap-1 answered 429 without a complete result, and the fallback is off\]$/m,
  )
  assert.match(
    refused.stderr,
    /^Error: the worker gave no answer \(status\) and the fallback is off/m,
  )
  const hidden = join(OUTSIDE, "stays-home.md")
  writeFileSync(hidden, "private notes\n")
  const before = server.seen.length
  const kept = await bulkRead(hidden, { CCSAVER_HOME: OFF_HOME })
  assert.equal(kept.code, 1)
  assert.equal(kept.stdout, "")
  assert.match(kept.stderr, /^Error: a file is outside .* the fallback is off, nothing was sent/m)
  assert.equal(server.seen.length, before)
})

test("the fallback runs bare and bounded, whatever the session has configured", async () => {
  const echo = join(WORK, "echo-args")
  const names = [
    "MAX_THINKING_TOKENS",
    "CLAUDE_CODE_EFFORT_LEVEL",
    "CLAUDE_CODE_DISABLE_TERMINAL_TITLE",
    "CLAUDE_CODE_PROMPT_CACHE_TTL",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  ]
  writeFileSync(
    echo,
    `#!/usr/bin/env node\nconst seen = ${JSON.stringify(names)}.map((name) => name + "=" + process.env[name]).join(" ")\nprocess.stdout.write(JSON.stringify({ result: process.argv.slice(2).join(" ") + " " + seen, total_cost_usd: 0 }))\n`,
    { mode: 0o755 },
  )
  const out = await bulkRead(SOURCE, {
    CCSAVER_HOME: BARE_HOME,
    CLAUDE_CODE_EXECPATH: echo,
    MAX_THINKING_TOKENS: "31999",
    CLAUDE_CODE_EFFORT_LEVEL: "max",
    CLAUDE_CODE_PROMPT_CACHE_TTL: "1h",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "0",
  })
  assert.ok(
    out.stdout.includes('--tools  --strict-mcp-config --mcp-config {"mcpServers":{}} --disable-'),
    out.stdout,
  )
  assert.ok(out.stdout.includes("--no-session-persistence --max-budget-usd 0.5 "), out.stdout)
  assert.ok(
    out.stdout.includes(
      '--settings {"disableAllHooks":true,"env":{"MAX_THINKING_TOKENS":"0","CLAUDE_CODE_EFFORT_LEVEL":"low","CLAUDE_CODE_DISABLE_TERMINAL_TITLE":"1","CLAUDE_CODE_PROMPT_CACHE_TTL":"5m","CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC":"1"}} ',
    ),
    out.stdout,
  )
  assert.ok(
    out.stdout.includes(
      "MAX_THINKING_TOKENS=0 CLAUDE_CODE_EFFORT_LEVEL=low CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 CLAUDE_CODE_PROMPT_CACHE_TTL=5m CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1",
    ),
    out.stdout,
  )
})

test("fails loudly when the fallback prints an error instead of a result", async () => {
  const hidden = join(OUTSIDE, "for-the-fallback.ts")
  writeFileSync(hidden, "export const x = 1\n")
  const scripted = (name: string, line: string, exit = 0): string => {
    const path = join(WORK, name)
    writeFileSync(path, `#!/bin/sh\necho '${line}'\nexit ${exit}\n`, { mode: 0o755 })
    return path
  }
  const failing = scripted("failing", '{"is_error":true,"result":"Credit balance is too low"}')
  const failed = await bulkRead(hidden, { CLAUDE_CODE_EXECPATH: failing })
  assert.equal(failed.code, 1)
  assert.equal(failed.stdout, "")
  assert.match(failed.stderr, /^Error: fallback worker failed: Credit balance is too low$/m)
  const broke = await bulkRead(hidden, {
    CLAUDE_CODE_EXECPATH: scripted(
      "broke",
      '{"is_error":true,"subtype":"error_max_budget_usd","errors":["Reached maximum budget ($0.5)"]}',
      1,
    ),
  })
  assert.equal(broke.code, 1)
  assert.match(broke.stderr, /^Error: fallback worker failed: Reached maximum budget \(\$0\.5\)$/m)
  const chatty = await bulkRead(hidden, {
    CLAUDE_CODE_EXECPATH: scripted("chatty", "not json at all"),
  })
  assert.equal(chatty.code, 1)
  assert.match(chatty.stderr, /^Error: fallback worker returned no result: not json at all/m)
})

test("a fallback that stops reading a big input still gets its say", async () => {
  const big = join(OUTSIDE, "bigger-than-a-pipe.md")
  writeFileSync(big, "x".repeat(200_000))
  const deaf = join(WORK, "deaf")
  const line = '{"is_error":true,"result":"Credit balance is too low"}'
  writeFileSync(deaf, `#!/bin/sh\necho '${line}'\n`, { mode: 0o755 })
  const out = await bulkRead(big, { CLAUDE_CODE_EXECPATH: deaf })
  assert.equal(out.code, 1)
  assert.match(out.stderr, /^Error: fallback worker failed: Credit balance is too low$/m)
})

test("the fallback names the cause it used to hide behind spawnSync", () => {
  const ran = (code: string): Error =>
    Object.assign(new Error(`spawnSync claude ${code}`), { code })
  assert.equal(troubleOf(undefined), undefined)
  assert.equal(troubleOf(ran("EPIPE")), undefined)
  assert.equal(troubleOf(ran("ETIMEDOUT")), "fallback worker timed out after 85 s")
  assert.equal(troubleOf(ran("ENOENT")), "fallback worker could not run: spawnSync claude ENOENT")
})

test("with the fallback off, a code-write the worker cannot take leaves no target behind", async () => {
  server.reply.status = 429
  const target = join(PROJECT, "never.ts")
  const out = await cli(
    ["code-write", "--project", PROJECT, "--spec=s", "--reference", SOURCE, "--target", target],
    { CCSAVER_HOME: OFF_HOME },
  )
  assert.deepEqual([out.code, out.stdout, existsSync(target)], [1, "", false])
  assert.match(out.stderr, /^Error: the worker gave no answer \(status\) and the fallback is off/m)
})
