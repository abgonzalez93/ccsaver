import assert from "node:assert/strict"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import { fellOf } from "../src/transport.ts"
import {
  CLI,
  type FakeServer,
  fakeClaude,
  type Ran,
  run,
  startServer,
  tempDir,
  writeHome,
} from "./helpers.ts"

const HOME = tempDir("transport-home")
const BARE_HOME = tempDir("transport-bare")
const PLAIN_HOME = tempDir("transport-plain")
const PINNED_HOME = tempDir("transport-pinned")
const OFF_HOME = tempDir("transport-off")
const WORK = tempDir("transport-work")
const OUTSIDE = tempDir("transport-outside")
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
  writeHome(PLAIN_HOME, {
    plugged: PLUGGED,
    worker: { url: "http://example.invalid/v1/chat/completions", model: "cheap-1" },
    key: "k-test",
  })
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
  for (const dir of [HOME, BARE_HOME, PLAIN_HOME, PINNED_HOME, OFF_HOME, WORK, OUTSIDE])
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

test("falls back to the Claude worker when the external model refuses", async () => {
  server.reply.status = 429
  assert.match((await bulkRead(SOURCE)).stdout, /FROM-CLAUDE/)
})

test("falls back when the external answer was cut short", async () => {
  server.reply.finish = "length"
  assert.match((await bulkRead(SOURCE)).stdout, /FROM-CLAUDE/)
})

test("uses the Claude worker when no external model is configured", async () => {
  const before = server.seen.length
  assert.match((await bulkRead(SOURCE, { CCSAVER_HOME: BARE_HOME })).stdout, /FROM-CLAUDE/)
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

test("the fallback runs bare: no tools, no MCP servers, no hooks and the lowest effort", async () => {
  const echo = join(WORK, "echo-args")
  writeFileSync(
    echo,
    '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ result: process.argv.slice(2).join(" ") + " effort=" + process.env.CLAUDE_CODE_EFFORT_LEVEL, total_cost_usd: 0 }))\n',
    { mode: 0o755 },
  )
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: BARE_HOME, CLAUDE_CODE_EXECPATH: echo })
  assert.ok(
    out.stdout.includes('--tools  --strict-mcp-config --mcp-config {"mcpServers":{}} --disable-'),
    out.stdout,
  )
  assert.ok(
    out.stdout.includes(
      '--settings {"disableAllHooks":true,"env":{"CLAUDE_CODE_EFFORT_LEVEL":"low"}} ',
    ),
    out.stdout,
  )
  assert.ok(out.stdout.includes("effort=low"), out.stdout)
})

test("never follows a redirect with the file in hand", async () => {
  server.reply.status = 307
  server.reply.location = "/elsewhere"
  const before = server.seen.length
  assert.match((await bulkRead(SOURCE)).stdout, /FROM-CLAUDE/)
  assert.equal(server.seen.length, before + 1)
})

test("fails loudly when the fallback prints an error instead of a result", async () => {
  const hidden = join(OUTSIDE, "for-the-fallback.ts")
  writeFileSync(hidden, "export const x = 1\n")
  const scripted = (name: string, line: string): string => {
    const path = join(WORK, name)
    writeFileSync(path, `#!/bin/sh\necho '${line}'\n`, { mode: 0o755 })
    return path
  }
  const failing = scripted("failing", '{"is_error":true,"result":"Credit balance is too low"}')
  const failed = await bulkRead(hidden, { CLAUDE_CODE_EXECPATH: failing })
  assert.equal(failed.code, 1)
  assert.equal(failed.stdout, "")
  assert.match(failed.stderr, /^Error: fallback worker failed: Credit balance is too low$/m)
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

test("keeps the key off an unencrypted url", async () => {
  const before = server.seen.length
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: PLAIN_HOME })
  assert.match(out.stderr, /not https/)
  assert.match(out.stdout, /FROM-CLAUDE/)
  assert.equal(server.seen.length, before)
})

test("a worker.json that cannot be trusted stops the call instead of paying for the fallback", async () => {
  const before = server.seen.length
  const broken: [string, string][] = [
    ["comma", `{"url":"${server.url}","model":"m","fallback":false,}`],
    ["typed", JSON.stringify({ url: server.url, model: "m", fallback: "false" })],
  ]
  for (const [name, text] of broken) {
    const home = join(WORK, `home-${name}`)
    writeHome(home, { plugged: PLUGGED, key: "k-test" })
    writeFileSync(join(home, "worker.json"), text)
    const out = await bulkRead(SOURCE, { CCSAVER_HOME: home })
    assert.equal(out.code, 1, name)
    assert.equal(out.stdout, "")
    assert.match(
      out.stderr,
      /^Error: .*worker\.json is malformed: fix it or delete it, nothing was sent$/m,
    )
  }
  assert.equal(server.seen.length, before)
})

test("says why before it pays: a worker with no key, and an answer that is not JSON", async () => {
  const keyless = join(WORK, "home-keyless")
  writeHome(keyless, { plugged: PLUGGED, worker: { url: server.url, model: "cheap-1" } })
  const silent = await bulkRead(SOURCE, { CCSAVER_HOME: keyless })
  assert.match(
    silent.stderr,
    /^\[ccsaver: no API key is stored \(ccsaver key set\), falling back\]$/m,
  )
  assert.match(silent.stdout, /FROM-CLAUDE/)
  server.reply.raw = "<html>busy</html>"
  const garbled = await bulkRead(SOURCE)
  assert.match(garbled.stderr, /^\[ccsaver: cheap-1 not json, falling back\]$/m)
  assert.match(garbled.stdout, /FROM-CLAUDE/)
})

test("tells a timeout from a dead port and from a body that is not JSON", async () => {
  const hung = createServer(() => {})
  await new Promise<void>((ready) => {
    hung.listen(0, "127.0.0.1", ready)
  })
  const address = hung.address()
  if (address === null || typeof address === "string") throw new Error("no port")
  const url = `http://127.0.0.1:${address.port}/`
  const slow: unknown = await fetch(url, { signal: AbortSignal.timeout(50) }).catch(
    (error: unknown) => error,
  )
  hung.closeAllConnections()
  await new Promise<void>((closed) => {
    hung.close(() => {
      closed()
    })
  })
  const dead: unknown = await fetch(url).catch((error: unknown) => error)
  assert.deepEqual(
    [fellOf(slow), fellOf(dead), fellOf(new SyntaxError("Unexpected token"))],
    ["timeout", "unreachable", "not json"],
  )
})
