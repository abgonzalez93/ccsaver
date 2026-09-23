import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import {
  CLI,
  everything,
  type FakeServer,
  fakeClaude,
  HAS_PTY,
  jsonOf,
  LAUNCHER,
  type Ran,
  run,
  startServer,
  tempDir,
} from "../helpers.ts"

const OLD_KEY = "k-old-0123456789-0123456789-012345678"

const HOME = tempDir("launcher-home")
const WORK = tempDir("launcher-work")
const FAKE = fakeClaude(WORK)

let server: FakeServer

const ccsaver = (args: string[], input = ""): Promise<Ran> =>
  run(LAUNCHER, args, { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE }, input)

before(async () => {
  server = await startServer()
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("key set stores the piped key privately and never echoes it", async () => {
  const out = await ccsaver(["key", "set"], `${OLD_KEY}\n`)
  assert.equal(out.code, 0)
  assert.equal(everything(out).includes(OLD_KEY), false)
  assert.equal(
    out.stderr,
    `key stored in ${join(HOME, "api-key")} (600)\ncheck it with: ccsaver doctor\n`,
  )
  assert.equal(readFileSync(join(HOME, "api-key"), "utf8"), `${OLD_KEY}\n`)
  assert.equal(statSync(join(HOME, "api-key")).mode & 0o777, 0o600)
  assert.equal(statSync(HOME).mode & 0o777, 0o700)
  const again = await ccsaver(["key", "set"], `${OLD_KEY}\n`)
  assert.match(again.stderr, /^key replaced in \S+api-key \(600\)\n/)
})

test("key set on a real terminal turns the echo off before it asks", {
  skip: !HAS_PTY,
  timeout: 20_000,
}, async () => {
  const home = join(WORK, "tty-home")
  const typed = "k-typed-on-a-terminal"
  const shown = await new Promise<string>((done) => {
    const child = spawn("script", ["-qec", `"${LAUNCHER}" key set`, "/dev/null"], {
      env: { ...process.env, CCSAVER_HOME: home },
    })
    let seen = ""
    let sent = false
    child.stdout.on("data", (chunk) => {
      seen += String(chunk)
      if (sent || !seen.includes("input hidden")) return
      sent = true
      child.stdin.write(`${typed}\n`)
    })
    child.on("close", () => {
      done(seen)
    })
  })
  assert.match(shown, /input hidden/)
  assert.equal(shown.includes(typed), false)
  assert.ok(shown.includes("\u001b[32m✓\u001b[0m key stored in "), shown)
  assert.equal(readFileSync(join(home, "api-key"), "utf8"), `${typed}\n`)
  assert.equal(statSync(join(home, "api-key")).mode & 0o777, 0o600)
})

test("key set refuses an empty key and keeps the stored one", async () => {
  const out = await ccsaver(["key", "set"], "\n")
  assert.equal(out.code, 1)
  assert.equal(readFileSync(join(HOME, "api-key"), "utf8"), `${OLD_KEY}\n`)
})

test("the launcher works through a symlink", async () => {
  const link = join(WORK, "ccsaver-link")
  symlinkSync(LAUNCHER, link)
  const out = await run(link, ["list"], { CCSAVER_HOME: HOME })
  assert.equal(out.code, 0)
  assert.equal(out.stdout, "nothing is plugged in\n")
  assert.equal(existsSync(join(HOME, "cache")), true)
})

test("setup asks for the four settings, keeps the key off the terminal and ends with doctor", async () => {
  const home = tempDir("launcher-setup")
  const out = await run(
    LAUNCHER,
    ["setup"],
    { CCSAVER_HOME: home, CLAUDE_CODE_EXECPATH: FAKE },
    `${server.url}\ncheap-1\n${OLD_KEY}\nn\n`,
  )
  assert.equal(everything(out).includes(OLD_KEY), false)
  assert.deepEqual(jsonOf(join(home, "worker.json")), {
    url: server.url,
    model: "cheap-1",
    fallback: false,
  })
  assert.equal(readFileSync(join(home, "api-key"), "utf8"), `${OLD_KEY}\n`)
  assert.match(out.stdout, /^ok {3}probe: cheap-1 accepted the key in \d+ ms$/m)
  assert.equal(out.code, 0)
  rmSync(home, { recursive: true, force: true })
})

test("setup stops on an empty answer and writes nothing", async () => {
  const home = tempDir("launcher-setup-empty")
  const out = await run(LAUNCHER, ["setup"], { CCSAVER_HOME: home }, "\n")
  assert.equal(out.code, 1)
  assert.match(out.stderr, /Error: nothing typed, setup stopped\n$/)
  assert.equal(existsSync(join(home, "worker.json")), false)
  rmSync(home, { recursive: true, force: true })
})

test("a relative CCSAVER_HOME is refused, by the launcher and by the command", async () => {
  const relative = "state"
  const shell = await run(LAUNCHER, ["list"], { CCSAVER_HOME: relative }, "", WORK)
  const node = await run("node", [CLI, "list"], { CCSAVER_HOME: relative }, "", WORK)
  for (const out of [shell, node]) {
    assert.equal(out.code, 1)
    assert.match(out.stderr, /Error: CCSAVER_HOME must be an absolute path, this one is not: state/)
  }
  assert.equal(existsSync(join(WORK, relative)), false)
})
