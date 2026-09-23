import assert from "node:assert/strict"
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
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

const HOME = tempDir("egress-home")
const WORK = tempDir("egress-work")
const OUTSIDE = tempDir("egress-outside")
const PROJECT = join(WORK, "project")
const STYLED = join(WORK, "styled")
const SOURCE = join(PROJECT, "source.ts")
const FAKE = fakeClaude(WORK)

let server: FakeServer

const cli = (args: string[], env: NodeJS.ProcessEnv = {}, cwd?: string): Promise<Ran> =>
  run("node", [CLI, ...args], { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env }, "", cwd)

const bulkRead = (path: string, env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  cli(["bulk-read", "--project", PROJECT, "--question", "q", "--paths", path], env)

before(async () => {
  server = await startServer()
  for (const dir of [PROJECT, STYLED]) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "source.ts"), "export const a = 1\nexport const b = 2\n")
  }
  writeHome(HOME, {
    plugged: [[PROJECT], [STYLED, "strict-ts"]],
    worker: { url: server.url, model: "cheap-1" },
    key: "k-test",
  })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK, OUTSIDE]) rmSync(dir, { recursive: true, force: true })
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

test("refuses a secrets file by its name, by its place and by what it holds", async () => {
  const before = server.seen.length
  mkdirSync(join(PROJECT, "secrets"), { recursive: true })
  const cases: [string, string | Buffer, RegExp][] = [
    [".env.local", "TOKEN=1\n", /secrets file/],
    [join("secrets", "prod.yaml"), "password: hunter2\n", /secrets file/],
    ["tokens.txt", `aws ${["AKIA", "IOSFODNN7EXAMPLE"].join("")}\n`, /access token/],
    ["blob.bin", Buffer.from([120, 10, 0]), /binary file/],
  ]
  const outs = await Promise.all(
    cases.map(async ([name, body, reason]) => {
      writeFileSync(join(PROJECT, name), body)
      return { out: await bulkRead(join(PROJECT, name)), reason }
    }),
  )
  for (const { out, reason } of outs) {
    assert.equal(out.code, 1)
    assert.match(out.stderr, reason)
  }
  assert.equal(server.seen.length, before)
})

test("refuses a file that holds a private key, whatever its name", async () => {
  const before = server.seen.length
  const armored = join(PROJECT, "deploy-notes.txt")
  writeFileSync(armored, `${["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" ")}\nabc\n`)
  const out = await bulkRead(armored)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /holds a private key/)
  assert.equal(server.seen.length, before)
})
