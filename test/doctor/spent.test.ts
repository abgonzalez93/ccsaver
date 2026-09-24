import assert from "node:assert/strict"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
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

const HOME = tempDir("spent-home")
const WORK = tempDir("spent-work")
const OUTSIDE = tempDir("spent-outside")
const PROJECT = join(WORK, "project")
const SOURCE = join(PROJECT, "source.ts")
const NOTES = join(OUTSIDE, "notes.md")
const PAID = fakeClaude(WORK, "paid-claude", "FROM-CLAUDE", 0.0125)

let server: FakeServer

const ccsaver = (args: string[]): Promise<Ran> =>
  run("node", [CLI, ...args], { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: PAID })

const ask = (...paths: string[]): Promise<Ran> =>
  ccsaver(["bulk-read", "--question=q", "--project", PROJECT, "--paths", ...paths])

before(async () => {
  server = await startServer()
  mkdirSync(PROJECT, { recursive: true })
  writeFileSync(SOURCE, "export const a = 1\n")
  writeFileSync(NOTES, "notes\n")
  writeHome(HOME, {
    plugged: [[PROJECT]],
    worker: { url: server.url, model: "cheap-1" },
    key: "k-test",
  })
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK, OUTSIDE]) rmSync(dir, { recursive: true, force: true })
})

test("the probe quotes the reason a rejected request came with, and stays quiet when there is none", async () => {
  const rejected = (status: number, body: string): Promise<Ran> => {
    server.reply.status = status
    server.reply.raw = body
    return ccsaver(["doctor"])
  }
  const wanted = "max_tokens is not supported with this model. Use max_completion_tokens instead."
  const asked = await rejected(400, JSON.stringify({ error: { message: wanted, type: "invalid" } }))
  assert.match(
    asked.stdout,
    /^FAIL probe: the key or the request was rejected \(400\): max_tokens is not supported with this model\. Use max_completion_tokens instead\.$/m,
  )
  const keyed = await rejected(401, JSON.stringify({ error: { message: "Incorrect API key" } }))
  assert.match(keyed.stdout, /^FAIL probe: the key was rejected \(401\): Incorrect API key$/m)
  const bare = await rejected(400, "<html>busy</html>")
  assert.match(bare.stdout, /^FAIL probe: the key or the request was rejected \(400\)$/m)
  const late = await rejected(503, JSON.stringify({ error: "overloaded\u001b[2J" }))
  assert.match(late.stdout, /^FAIL probe: cheap-1 answered 503 in \d+ ms: overloaded\\x1b\[2J$/m)
  server.reset()
})

test("doctor says nothing about spending while the log is off", async () => {
  assert.doesNotMatch((await ccsaver(["doctor"])).stdout, /spent:/)
})

test("doctor counts the month's delegations that went to paid Claude Haiku, what they cost and why", async () => {
  assert.equal((await ccsaver(["log", "on"])).code, 0)
  assert.equal((await ask(SOURCE)).code, 0)
  server.reply.status = 429
  assert.equal((await ask(SOURCE)).code, 0)
  assert.equal((await ask(SOURCE)).code, 0)
  server.reset()
  assert.equal((await ask(SOURCE, NOTES)).code, 0)
  assert.match(
    (await ccsaver(["doctor"])).stdout,
    /^ok {3}spent: 3 of 4 delegations this month went to paid Claude Haiku \(\$0\.0375\): 2 status, 1 outside$/m,
  )
})
