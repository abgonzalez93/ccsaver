import assert from "node:assert/strict"
import { chmodSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import { isRecord } from "../src/state.ts"
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

const PINNED_CODE_WRITE =
  "You generate code files based on a spec and reference files. Match the existing patterns, conventions, naming, and style exactly. Output only the code — no explanations, no markdown fences unless asked. If the spec is ambiguous, make reasonable choices that match the patterns in the reference code. House rules, they win over the reference: no comments of any kind; every function is an arrow const with an explicit return type, never the function keyword; no any; no non-null assertion (!); no type assertion (as) other than as const; relative imports carry the real file extension."

const HOME = tempDir("worker-home")
const BARE_HOME = tempDir("worker-bare")
const PLAIN_HOME = tempDir("worker-plain")
const PINNED_HOME = tempDir("worker-pinned")
const WORK = tempDir("worker-work")
const OUTSIDE = tempDir("worker-outside")
const PROJECT = join(WORK, "project")
const STYLED = join(WORK, "styled")
const FORMATTED = join(WORK, "formatted")
const UNPLUGGED = join(WORK, "unplugged")
const SOURCE = join(PROJECT, "source.ts")
const FAKE = fakeClaude(WORK)
const UNFORMATTED = join(WORK, "unformatted")
const PLUGGED = [[PROJECT], [STYLED, "strict-ts"], [FORMATTED, "fmt"], [UNFORMATTED, "nofmt"]]

let server: FakeServer

const cli = (args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): Promise<Ran> =>
  run("node", [CLI, ...args], { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env }, "", cwd)

const bulkRead = (path: string, env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  cli(["bulk-read", "--project", PROJECT, "--question", "q", "--paths", path], env)

const systemSeen = (): unknown => {
  const raw: unknown = JSON.parse(server.seen.at(-1)?.body ?? "{}")
  const first: unknown =
    isRecord(raw) && Array.isArray(raw["messages"]) ? raw["messages"][0] : undefined
  return isRecord(first) ? first["content"] : undefined
}

before(async () => {
  server = await startServer()
  for (const dir of [PROJECT, STYLED, UNPLUGGED, join(FORMATTED, "tools"), join(HOME, "adapters")])
    mkdirSync(dir, { recursive: true })
  mkdirSync(UNFORMATTED, { recursive: true })
  writeFileSync(
    join(HOME, "adapters", "nofmt.json"),
    JSON.stringify({ format: ["tools/missing.sh"] }),
  )
  for (const dir of [PROJECT, STYLED, FORMATTED, UNFORMATTED, UNPLUGGED])
    writeFileSync(join(dir, "source.ts"), "export const a = 1\nexport const b = 2\n")
  writeFileSync(
    join(FORMATTED, "tools", "fmt.sh"),
    '#!/bin/sh\nprintf "export const formatted = 1\\n" >> "$1"\n',
  )
  chmodSync(join(FORMATTED, "tools", "fmt.sh"), 0o755)
  writeFileSync(
    join(HOME, "adapters", "fmt.json"),
    JSON.stringify({ format: ["tools/fmt.sh"], after: ["check {target}", "then test"] }),
  )
  writeHome(HOME, {
    plugged: PLUGGED,
    worker: { url: server.url, model: "cheap-1" },
    key: "k-test",
  })
  writeHome(BARE_HOME, { plugged: PLUGGED })
  writeHome(PLAIN_HOME, {
    plugged: PLUGGED,
    worker: { url: "http://example.invalid/v1/chat/completions", model: "cheap-1" },
    key: "k-test",
  })
  writeHome(PINNED_HOME, {
    plugged: PLUGGED,
    worker: {
      url: server.url,
      model: "cheap-1",
      claude: fakeClaude(WORK, "pinned", "FROM-PINNED"),
    },
    key: "k-test",
  })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, BARE_HOME, PLAIN_HOME, PINNED_HOME, WORK, OUTSIDE])
    rmSync(dir, { recursive: true, force: true })
})

test("bulk-read sends numbered files and the question to the external model", async () => {
  const out = await cli([
    "bulk-read",
    "--project",
    PROJECT,
    "--question",
    "what is b?",
    "--paths",
    SOURCE,
  ])
  const last = server.seen.at(-1)
  assert.match(out.stdout, /FROM-EXTERNAL/)
  assert.match(out.stderr, /^\[ccsaver: .*external \| cheap-1 \| delegated to bulk-read\]$/m)
  assert.equal(last?.authorization, "Bearer k-test")
  assert.ok(last?.body.includes('"model":"cheap-1"'))
  assert.ok(last?.body.includes("2\\texport const b = 2"))
  assert.ok(last?.body.includes("Question: what is b?"))
  assert.ok(last?.body.includes('<file path=\\"source.ts\\">'))
  assert.equal(last?.body.includes(WORK), false)
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

test("code-write strips the markdown fence, writes the target and never overwrites", async () => {
  server.reply.content = "```ts\nexport const c = 3\n```"
  const target = join(PROJECT, "out.ts")
  const args = ["code-write", "--project", PROJECT, "--spec", "add c", "--reference", SOURCE]
  const out = await cli([...args, "--target", target])
  assert.equal(out.code, 0)
  assert.equal(out.stdout, `wrote ${target} (1 lines)\n`)
  assert.equal(readFileSync(target, "utf8"), "export const c = 3\n")
  const again = await cli([...args, "--target", target])
  assert.equal(again.code, 1)
  assert.match(again.stderr, /refusing to overwrite/)
  assert.equal((await cli(args)).stdout, "export const c = 3\n")
})

test("strips an echoed file wrapper", async () => {
  server.reply.content = '<file path="/x/out.ts">\n\nexport const d = 4\n</file>'
  const target = join(PROJECT, "wrapped.ts")
  await cli([
    "code-write",
    "--project",
    PROJECT,
    "--spec",
    "add d",
    "--reference",
    SOURCE,
    "--target",
    target,
  ])
  assert.equal(readFileSync(target, "utf8"), "export const d = 4\n")
})

test("formats with the adapter and lists its follow-up commands", async () => {
  server.reply.content = "export const e = 5\n"
  const target = join(FORMATTED, "made.ts")
  const out = await cli([
    "code-write",
    "--project",
    FORMATTED,
    "--spec",
    "add e",
    "--reference",
    join(FORMATTED, "source.ts"),
    "--target",
    target,
  ])
  assert.equal(readFileSync(target, "utf8"), "export const e = 5\nexport const formatted = 1\n")
  assert.equal(out.stdout, `wrote ${target} (2 lines)\nnext: check ${target}\nnext: then test\n`)
})

test("says so when the formatter of the adapter cannot run", async () => {
  server.reply.content = "export const f = 6\n"
  const target = join(UNFORMATTED, "made.ts")
  const out = await cli([
    "code-write",
    "--project",
    UNFORMATTED,
    "--spec",
    "add f",
    "--reference",
    join(UNFORMATTED, "source.ts"),
    "--target",
    target,
  ])
  assert.equal(out.code, 0)
  assert.match(out.stderr, /the formatter could not run/)
  assert.equal(readFileSync(target, "utf8"), "export const f = 6\n")
})

test("the adapter rules complete the measured code-write instruction, byte for byte", async () => {
  const args = ["--spec", "s", "--reference"]
  await cli(["code-write", "--project", STYLED, ...args, join(STYLED, "source.ts")])
  assert.equal(PINNED_CODE_WRITE.length, 584)
  assert.equal(systemSeen(), PINNED_CODE_WRITE)
  await cli(["code-write", "--project", PROJECT, ...args, SOURCE])
  assert.equal(systemSeen(), PINNED_CODE_WRITE.slice(0, 299))
})

test("a project that is not plugged in gets a one-line error and nothing leaves", async () => {
  const before = server.seen.length
  const source = join(UNPLUGGED, "source.ts")
  const out = await cli(["bulk-read", "--project", UNPLUGGED, "--question", "q", "--paths", source])
  assert.equal(out.code, 1)
  assert.equal(out.stdout, "")
  assert.match(out.stderr, /^Error: .*is not plugged in, nothing was sent.*\n$/)
  assert.equal(server.seen.length, before)
})

test("the project defaults to the working directory", async () => {
  const args = ["bulk-read", "--question", "q", "--paths", "source.ts"]
  assert.match((await cli(args, {}, PROJECT)).stdout, /FROM-EXTERNAL/)
  assert.equal((await cli(args, {}, UNPLUGGED)).code, 1)
})

test("keeps files outside the plugged root away from the external model", async () => {
  const hidden = join(OUTSIDE, "notes.md")
  writeFileSync(hidden, "private notes\n")
  const before = server.seen.length
  assert.match((await bulkRead(hidden)).stdout, /FROM-CLAUDE/)
  assert.match((await bulkRead(join(STYLED, "source.ts"))).stdout, /FROM-CLAUDE/)
  assert.equal(server.seen.length, before)
})

test("follows a symlink before trusting its place and its name", async () => {
  const hidden = join(OUTSIDE, "private.ts")
  const dotenv = join(OUTSIDE, ".env")
  writeFileSync(hidden, "export const hidden = 1\n")
  writeFileSync(dotenv, "TOKEN=1\n")
  symlinkSync(hidden, join(PROJECT, "link.ts"))
  symlinkSync(dotenv, join(PROJECT, "notes.txt"))
  symlinkSync(SOURCE, join(PROJECT, ".env.alias"))
  const before = server.seen.length
  assert.match((await bulkRead(join(PROJECT, "link.ts"))).stdout, /FROM-CLAUDE/)
  assert.equal((await bulkRead(join(PROJECT, "notes.txt"))).code, 1)
  assert.equal((await bulkRead(join(PROJECT, ".env.alias"))).code, 1)
  assert.equal(server.seen.length, before)
})

test("keeps the key off an unencrypted url", async () => {
  const before = server.seen.length
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: PLAIN_HOME })
  assert.match(out.stderr, /not https/)
  assert.match(out.stdout, /FROM-CLAUDE/)
  assert.equal(server.seen.length, before)
})

test("names the real reason when the target cannot be written", async () => {
  server.reply.content = "export const c = 3\n"
  const out = await cli([
    "code-write",
    "--project",
    PROJECT,
    "--spec",
    "s",
    "--reference",
    SOURCE,
    "--target",
    join(PROJECT, "missing", "out.ts"),
  ])
  assert.equal(out.code, 1)
  assert.match(out.stderr, /ENOENT/)
})

test("rejects a mode inherited from the prototype", async () => {
  assert.equal((await cli(["toString", "--paths", SOURCE])).code, 1)
})

test("refuses to send a secrets file", async () => {
  const before = server.seen.length
  const codes = await Promise.all(
    [".env.local", ".netrc", "id_ecdsa", "release.jks", "api-key"].map(async (name) => {
      const secret = join(PROJECT, name)
      writeFileSync(secret, "TOKEN=1\n")
      return (await bulkRead(secret)).code
    }),
  )
  assert.deepEqual(codes, [1, 1, 1, 1, 1])
  assert.equal(server.seen.length, before)
})

test("fails loudly on a missing file and on a missing question", async () => {
  assert.equal((await bulkRead(join(PROJECT, "nope.ts"))).code, 1)
  assert.equal((await cli(["bulk-read", "--project", PROJECT, "--paths", SOURCE])).code, 1)
})
