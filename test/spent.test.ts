import assert from "node:assert/strict"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { CLI, type FakeServer, type Ran, run, startServer, tempDir, writeHome } from "./helpers.ts"

const HOME = tempDir("spent-home")
const WORK = tempDir("spent-work")
const OUTSIDE = tempDir("spent-outside")
const PROJECT = join(WORK, "project")
const SOURCE = join(PROJECT, "source.ts")
const NOTES = join(OUTSIDE, "notes.md")
const PAID = join(WORK, "paid-claude")

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
  writeFileSync(
    PAID,
    '#!/usr/bin/env node\nprocess.stdout.write(process.argv.includes("--version") ? "9.9.9 (fake)\\n" : JSON.stringify({ result: "FROM-CLAUDE", total_cost_usd: 0.0125 }))\n',
    { mode: 0o755 },
  )
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

test("doctor says nothing about spending while the log is off", async () => {
  assert.doesNotMatch((await ccsaver(["doctor"])).stdout, /spent:/)
})

test("doctor counts the month's delegations that went to paid Claude Haiku, what they cost and why", async () => {
  assert.equal((await ccsaver(["log", "on"])).code, 0)
  assert.equal((await ask(SOURCE)).code, 0)
  server.reply.finish = "length"
  assert.equal((await ask(SOURCE)).code, 0)
  assert.equal((await ask(SOURCE)).code, 0)
  server.reset()
  assert.equal((await ask(SOURCE, NOTES)).code, 0)
  assert.match(
    (await ccsaver(["doctor"])).stdout,
    /^ok {3}spent: 3 of 4 delegations this month went to paid Claude Haiku \(\$0\.0375\): 2 length, 1 outside$/m,
  )
})
