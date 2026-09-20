import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import { isRecord } from "../src/state.ts"
import {
  type FakeServer,
  fakeClaude,
  LAUNCHER,
  type Ran,
  REPO,
  run,
  startServer,
  tempDir,
} from "./helpers.ts"

const OLD_KEY = "k-old-0123456789-0123456789-012345678"

const HOME = tempDir("cli-home")
const WORK = tempDir("cli-work")
const PROJECT = join(WORK, "project")
const GONE = join(WORK, "gone")
const FAKE = fakeClaude(WORK)

let server: FakeServer

const ccsaver = (args: string[], input = "", env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run(LAUNCHER, args, { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env }, input)

const everything = (out: Ran): string => `${out.stdout}${out.stderr}`

const jsonOf = (path: string): Record<PropertyKey, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
  assert.ok(isRecord(raw))
  return raw
}

before(async () => {
  server = await startServer()
  for (const dir of [PROJECT, GONE]) mkdirSync(dir, { recursive: true })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("key set stores the piped key privately and never echoes it", async () => {
  const out = await ccsaver(["key", "set"], `${OLD_KEY}\n`)
  assert.equal(out.code, 0)
  assert.equal(everything(out).includes(OLD_KEY), false)
  assert.equal(readFileSync(join(HOME, "api-key"), "utf8"), `${OLD_KEY}\n`)
  assert.equal(statSync(join(HOME, "api-key")).mode & 0o777, 0o600)
  assert.equal(statSync(HOME).mode & 0o777, 0o700)
})

const HAS_PTY = process.platform === "linux" && spawnSync("script", ["--version"]).status === 0

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
  const home = tempDir("cli-setup")
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
  const home = tempDir("cli-setup-empty")
  const out = await run(LAUNCHER, ["setup"], { CCSAVER_HOME: home }, "\n")
  assert.equal(out.code, 1)
  assert.match(out.stderr, /Error: nothing typed, setup stopped\n$/)
  assert.equal(existsSync(join(home, "worker.json")), false)
  rmSync(home, { recursive: true, force: true })
})

test("plug with no directory plugs the one the command runs in", async () => {
  const home = tempDir("cli-here")
  const out = await run(LAUNCHER, ["plug"], { CCSAVER_HOME: home }, "", PROJECT)
  assert.deepEqual([out.code, out.stdout], [0, `plugged ${PROJECT} · adapter none\n`])
  assert.equal(readFileSync(join(home, "plugged"), "utf8"), `${PROJECT}\t\n`)
  rmSync(home, { recursive: true, force: true })
})

test("plug, list and unplug from the command line", async () => {
  assert.equal((await ccsaver(["plug", PROJECT, "strict-ts"])).code, 0)
  assert.equal((await ccsaver(["plug", GONE])).code, 0)
  assert.equal((await ccsaver(["list"])).stdout, `${PROJECT}\tstrict-ts\n${GONE}\t\n`)
  assert.equal((await ccsaver(["unplug", GONE])).stdout, `unplugged ${GONE}\n`)
  assert.equal((await ccsaver(["unplug", GONE])).stdout, `${GONE} was not plugged\n`)
  assert.equal((await ccsaver(["unplug"])).code, 1)
  assert.equal((await ccsaver(["plug", GONE])).code, 0)
  const refused = await ccsaver(["plug", "/"])
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /^Error: refusing to plug \/: /)
  assert.equal((await ccsaver(["frobnicate"])).code, 1)
  assert.equal((await ccsaver([])).code, 0)
})

test("help goes to stdout, a mistake gets the usage on stderr, and version is the package's", async () => {
  const help = await ccsaver(["--help"])
  assert.deepEqual([help.code, help.stderr], [0, ""])
  assert.match(help.stdout, /^usage: ccsaver <command>/)
  assert.equal((await ccsaver(["-h"])).stdout, help.stdout)
  for (const mistake of [["frobnicate"], ["key"], ["key", "get"], ["worker", "claude"]]) {
    const out = await ccsaver(mistake)
    assert.deepEqual([out.code, out.stdout, out.stderr], [1, "", help.stdout], mistake.join(" "))
  }
  const { version } = jsonOf(join(REPO, "package.json"))
  assert.equal((await ccsaver(["version"])).stdout, `${String(version)}\n`)
  assert.equal((await ccsaver(["--version"])).stdout, `${String(version)}\n`)
})

test("a key in the worker url never reaches the terminal, and one in userinfo is refused", async () => {
  const keyed = `${server.url}?key=QUERY_SENTINEL`
  const set = await ccsaver(["worker", "set", keyed, "cheap-1"])
  assert.equal(set.code, 0)
  assert.equal(set.stdout, `worker set to ${server.url} · cheap-1\n`)
  assert.equal(everything(set).includes("QUERY_SENTINEL"), false)
  const seen = await ccsaver(["doctor"])
  assert.equal(everything(seen).includes("QUERY_SENTINEL"), false)
  assert.match(
    seen.stdout,
    /^ok {3}worker: http:\/\/127\.0\.0\.1:\d+\/v1\/chat\/completions · cheap-1$/m,
  )
  assert.equal(jsonOf(join(HOME, "worker.json"))["url"], keyed)
  assert.ok(server.seen.at(-1)?.body.includes("cheap-1"))
  const inside = await ccsaver(["worker", "set", "https://me:token@example.invalid/v1", "cheap-1"])
  assert.deepEqual([inside.code, inside.stdout], [1, ""])
  assert.match(inside.stderr, /^Error: the worker url must carry no user name or password/)
  await ccsaver(["worker", "set", server.url, "cheap-1"])
})
test("worker claude pins the fallback binary, and auto gives it back to the session", async () => {
  const file = join(HOME, "worker.json")
  assert.equal((await ccsaver(["worker", "claude", FAKE])).stdout, `fallback binary: ${FAKE}\n`)
  assert.equal(jsonOf(file)["claude"], FAKE)
  const missing = await ccsaver(["worker", "claude", join(WORK, "no-such-bin")])
  assert.equal(missing.code, 1)
  assert.match(missing.stderr, /^Error: not a file: /)
  assert.equal(jsonOf(file)["claude"], FAKE)
  const auto = await ccsaver(["worker", "claude", "auto"])
  assert.equal(auto.stdout, "fallback binary: the session's own claude\n")
  assert.deepEqual(Object.keys(jsonOf(file)), ["url", "model"])
})

test("moving the worker to another host warns that the stored key stays", async () => {
  const moved = await ccsaver(["worker", "set", "https://other.invalid/v1", "cheap-1"])
  assert.equal(moved.code, 0)
  assert.match(
    moved.stderr,
    /^warn: the worker moved from 127\.0\.0\.1:\d+ to other\.invalid and the stored key stays: run ccsaver key set /,
  )
  const back = await ccsaver(["worker", "set", server.url, "cheap-2"])
  assert.match(back.stderr, /^warn: the worker moved from other\.invalid to 127\.0\.0\.1:\d+ /)
  assert.equal((await ccsaver(["worker", "set", server.url, "cheap-1"])).stderr, "")
})
