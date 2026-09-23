import assert from "node:assert/strict"
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import { fellOf } from "../../src/delegation/worker.client.ts"
import { isRecord } from "../../src/state/state.store.ts"
import {
  AS_ROOT,
  CLI,
  type FakeServer,
  fakeClaude,
  type Ran,
  REPO,
  run,
  startServer,
  tempDir,
  writeHome,
} from "../test.helpers.ts"

const HOME = tempDir("transport-home")
const PLAIN_HOME = tempDir("transport-plain")
const WORK = tempDir("transport-work")
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
  writeHome(PLAIN_HOME, {
    plugged: PLUGGED,
    worker: { url: "http://example.invalid/v1/chat/completions", model: "cheap-1" },
    key: "k-test",
  })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, PLAIN_HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("falls back to the Claude worker when the external model refuses", async () => {
  server.reply.status = 429
  assert.match((await bulkRead(SOURCE)).stdout, /FROM-CLAUDE/)
})

test("falls back when the external answer was cut short, and says that is why", async () => {
  server.reply.finish = "length"
  const out = await bulkRead(SOURCE)
  assert.match(out.stdout, /FROM-CLAUDE/)
  assert.match(
    out.stderr,
    /^\[ccsaver: cheap-1 cut its answer short \(finish_reason length\), falling back\]$/m,
  )
})

test("the three waits of a delegation fit inside the 120 s the Bash tool gives a command", () => {
  const msOf = (file: string, name: string): number =>
    Number(
      new RegExp(`^const ${name} = ([\\d_]+)$`, "m")
        .exec(readFileSync(join(REPO, "src", "delegation", file), "utf8"))?.[1]
        ?.replaceAll("_", ""),
    )
  const external = msOf("worker.client.ts", "EXTERNAL_TIMEOUT_MS")
  const fallback = msOf("worker.client.ts", "FALLBACK_TIMEOUT_MS")
  const formatter = msOf("delegation.service.ts", "FORMAT_TIMEOUT_MS")
  const budget = msOf("delegation.service.ts", "BASH_BUDGET_MS")
  const floor = msOf("delegation.service.ts", "FORMAT_FLOOR_MS")
  const waits = [external, fallback, formatter, budget, floor]
  assert.ok(
    waits.every((ms) => ms > 0),
    String(waits),
  )
  assert.ok(external + fallback <= budget, String([external, fallback, budget]))
  assert.ok(budget + floor < 120_000, String([budget, floor]))
  assert.ok(formatter <= budget, String([formatter, budget]))
})

test("never follows a redirect with the file in hand", async () => {
  server.reply.status = 307
  server.reply.location = "/elsewhere"
  const before = server.seen.length
  const out = await bulkRead(SOURCE)
  assert.match(out.stdout, /FROM-CLAUDE/)
  assert.match(out.stderr, /^\[ccsaver: cheap-1 redirect, falling back\]$/m)
  assert.equal(server.seen.length, before + 1)
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

test("an answer that comes in text parts is read, not paid for again", async () => {
  server.reply.raw = JSON.stringify({
    choices: [
      {
        message: {
          content: [
            { type: "text", text: "* one" },
            { type: "text", text: " and two" },
          ],
        },
        finish_reason: "stop",
      },
    ],
  })
  const out = await bulkRead(SOURCE)
  assert.match(out.stdout, /\* one and two/)
  assert.equal(out.stdout.includes("FROM-CLAUDE"), false)
  assert.equal(out.stderr.includes("falling back"), false)
})

test("a key that cannot be read is named, never taken for a key that was never stored", {
  skip: AS_ROOT,
}, async () => {
  const locked = join(WORK, "home-locked")
  writeHome(locked, {
    plugged: PLUGGED,
    worker: { url: server.url, model: "cheap-1" },
    key: "k-test",
  })
  chmodSync(join(locked, "api-key"), 0o000)
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: locked })
  chmodSync(join(locked, "api-key"), 0o600)
  assert.match(out.stderr, /^\[ccsaver: .*api-key cannot be read .*falling back\]$/m)
  assert.equal(out.stderr.includes("no API key is stored"), false)
  assert.match(out.stdout, /FROM-CLAUDE/)
})

test("a key no HTTP header can carry is named, and the request is never made", async () => {
  const bent = join(WORK, "home-bent")
  writeHome(bent, {
    plugged: PLUGGED,
    worker: { url: server.url, model: "cheap-1" },
    key: "k-pasted\u201d-0123456789",
  })
  const before = server.seen.length
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: bent })
  assert.match(
    out.stderr,
    /^\[ccsaver: .*api-key holds a character no HTTP header can carry.*falling back\]$/m,
  )
  assert.equal(out.stderr.includes("unreachable"), false)
  assert.equal(server.seen.length, before)
  assert.match(out.stdout, /FROM-CLAUDE/)
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
  const bounced = new TypeError("fetch failed", { cause: new Error("unexpected redirect") })
  assert.deepEqual(
    [fellOf(slow), fellOf(dead), fellOf(new SyntaxError("Unexpected token")), fellOf(bounced)],
    ["timeout", "unreachable", "not json", "redirect"],
  )
})

test("an answer with no text in it is no answer, and falls back saying so", async () => {
  const bodies = [
    JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "stop" }] }),
    JSON.stringify({ choices: [{ message: { content: [{ type: "reasoning", text: 7 }] } }] }),
    JSON.stringify({ choices: [] }),
    "null",
  ]
  for (const raw of bodies) {
    server.reply.raw = raw
    const out = await bulkRead(SOURCE)
    assert.match(out.stdout, /FROM-CLAUDE/, raw)
    assert.match(
      out.stderr,
      /^\[ccsaver: cheap-1 answered 200 without a complete result, falling back\]$/m,
      raw,
    )
  }
})

test("the stored key is hidden in the answer the command prints, as it is in the log", async () => {
  const echo = join(WORK, "home-echo")
  const key = "k-test-0123456789"
  writeHome(echo, { plugged: PLUGGED, worker: { url: server.url, model: "cheap-1" }, key })
  server.reply.content = `the header carried ${key} and ${key} again`
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: echo })
  assert.equal(out.code, 0)
  assert.equal(out.stdout.includes(key), false)
  assert.match(out.stdout, /the header carried \[key\] and \[key\] again/)
})

test("the fallback switch is read again at the moment of falling, not only when the call starts", async () => {
  const flip = join(WORK, "home-flip")
  const worker = { url: server.url, model: "cheap-1" }
  writeHome(flip, { plugged: PLUGGED, worker, key: "k-test" })
  server.reply.status = 503
  server.reply.delayMs = 1500
  const call = bulkRead(SOURCE, { CCSAVER_HOME: flip })
  await new Promise((tick) => setTimeout(tick, 500))
  writeHome(flip, { worker: { ...worker, fallback: false } })
  const out = await call
  assert.equal(out.code, 1)
  assert.equal(out.stdout, "")
  assert.match(out.stderr, /the worker gave no answer \(status\) and the fallback is off/)
})

test("bulk-read asks for 2,048 tokens of answer and code-write for 8,192, and a body past 4 MB is no answer", async () => {
  const asked = (): unknown => {
    const raw: unknown = JSON.parse(server.seen.at(-1)?.body ?? "{}")
    return isRecord(raw) ? raw["max_tokens"] : undefined
  }
  assert.equal((await bulkRead(SOURCE)).code, 0)
  assert.equal(asked(), 2048)
  await cli(["code-write", "--project", PROJECT, "--spec", "s", "--reference", SOURCE])
  assert.equal(asked(), 8192)
  server.reply.raw = JSON.stringify({
    choices: [{ message: { content: "x".repeat(5 * 1024 * 1024) }, finish_reason: "stop" }],
  })
  const out = await bulkRead(SOURCE)
  assert.match(out.stderr, /cheap-1 answered 200 without a complete result, falling back/)
  assert.match(out.stdout, /FROM-CLAUDE/)
})

test("a key set aside when the worker moved stops the call, and nothing is sent anywhere", async () => {
  const moved = join(WORK, "home-moved")
  writeHome(moved, { plugged: PLUGGED, worker: { url: server.url, model: "cheap-1" } })
  writeFileSync(join(moved, "api-key.moved"), "k-test\n", { mode: 0o600 })
  const before = server.seen.length
  const out = await bulkRead(SOURCE, { CCSAVER_HOME: moved })
  assert.equal(out.code, 1)
  assert.equal(out.stdout, "")
  assert.match(
    out.stderr,
    /^Error: the worker moved to http:\/\/127\.0\.0\.1:\d+\/v1\/chat\/completions and the key was set aside in .*api-key\.moved: run ccsaver key set$/m,
  )
  assert.equal(server.seen.length, before)
})
