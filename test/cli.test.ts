import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import { isRecord } from "../src/state.ts"
import {
  CLI,
  type FakeServer,
  fakeClaude,
  LAUNCHER,
  type Ran,
  REPO,
  run,
  startServer,
  tempDir,
  writeHome,
} from "./helpers.ts"

const OLD_KEY = "k-old-0123456789-0123456789-012345678"
const NEW_KEY = "k-new-9876543210-9876543210-987654321"

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

test("key set needs the launcher", async () => {
  const out = await run("node", [CLI, "key", "set"], { CCSAVER_HOME: HOME })
  assert.equal(out.code, 1)
  assert.match(out.stderr, /^Error: run the ccsaver launcher/)
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
  assert.equal((await ccsaver(["plug"])).code, 1)
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

test("doctor fails on a rejected key, and passes once the key is rotated", async () => {
  server.reply.accepts = NEW_KEY
  assert.equal((await ccsaver(["worker", "set", server.url, "cheap-1"])).code, 0)
  const rejected = await ccsaver(["doctor"])
  assert.equal(rejected.code, 1)
  assert.match(rejected.stdout, /^FAIL probe: the key was rejected \(401\)$/m)
  assert.equal(server.seen.at(-1)?.authorization, `Bearer ${OLD_KEY}`)
  assert.equal((await ccsaver(["key", "set"], `${NEW_KEY}\n`)).code, 0)
  const accepted = await ccsaver(["doctor"])
  assert.equal(accepted.code, 0)
  assert.match(accepted.stdout, /^ok {3}probe: cheap-1 accepted the key in \d+ ms$/m)
  assert.ok(server.seen.at(-1)?.body.includes('"max_tokens":1'))
  for (const out of [rejected, accepted]) {
    assert.equal(everything(out).includes(OLD_KEY), false)
    assert.equal(everything(out).includes(NEW_KEY), false)
    assert.equal(
      out.stdout.split("\n").find((line) => line.includes(" key: ")),
      `ok   key: ${join(HOME, "api-key")} (600)`,
    )
  }
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

test("doctor fails on a worker.json it cannot trust", async () => {
  const home = join(WORK, "garbled-home")
  writeHome(home, { plugged: [[PROJECT]] })
  writeFileSync(join(home, "worker.json"), "{")
  const out = await ccsaver(["doctor"], "", { CCSAVER_HOME: home })
  assert.equal(out.code, 1)
  assert.match(out.stdout, /^FAIL worker: .*worker\.json is malformed: fix it or delete it/m)
  assert.match(out.stdout, /^ok {3}gate: /m)
})

test("doctor reports the fallback, the limits of each project and a folder that is gone", async () => {
  rmSync(GONE, { recursive: true })
  const out = await ccsaver(["doctor"])
  assert.match(out.stdout, /^ok {3}fallback: .*claude \(9\.9\.9 \(fake\)\)$/m)
  assert.match(out.stdout, /^ok {3}plugged: .*project · adapter strict-ts · reads over 350 lines/m)
  assert.match(out.stdout, /^ok {3}gate: .*project · the hook denied a 351-line read$/m)
  assert.match(out.stdout, /^warn plugged: .*gone no longer exists$/m)
  assert.equal(out.code, 0)
})

test("doctor stops at a node that is too old, and fails when the hook does not deny", async () => {
  const bin = join(WORK, "old-node")
  mkdirSync(bin)
  writeFileSync(
    join(bin, "node"),
    '#!/bin/sh\n[ "$1" = --version ] && echo v20.11.0 && exit 0\nexit 1\n',
  )
  chmodSync(join(bin, "node"), 0o755)
  const env = { PATH: `${bin}:${process.env["PATH"] ?? ""}` }
  const stopped = await ccsaver(["doctor"], "", env)
  assert.equal(stopped.code, 1)
  assert.equal(
    stopped.stdout,
    "FAIL node: ccsaver needs Node.js 24 or newer, this PATH has v20.11.0\n",
  )
  const open = await run(process.execPath, [CLI, "doctor"], {
    CCSAVER_HOME: HOME,
    CLAUDE_CODE_EXECPATH: FAKE,
    ...env,
  })
  assert.equal(open.code, 1)
  assert.match(open.stdout, /^FAIL gate: .*project · the hook let a 351-line read through$/m)
})

test("doctor fails on a key readable by others and on a fallback that does not run", async () => {
  chmodSync(join(HOME, "api-key"), 0o644)
  const loose = await ccsaver(["doctor"])
  assert.equal(loose.code, 1)
  assert.match(loose.stdout, /^FAIL key: .* is 644, expected 600$/m)
  chmodSync(join(HOME, "api-key"), 0o600)
  const broken = await ccsaver(["doctor"], "", { CLAUDE_CODE_EXECPATH: join(WORK, "no-such-bin") })
  assert.equal(broken.code, 1)
  assert.match(broken.stdout, /^FAIL fallback: /m)
})

test("doctor only warns about a missing fallback from a shell outside Claude Code", async () => {
  const bin = join(WORK, "bin")
  mkdirSync(bin)
  symlinkSync(process.execPath, join(bin, "node"))
  const bare = {
    PATH: `${bin}:/usr/bin:/bin`,
    CLAUDE_CODE_EXECPATH: "",
    CLAUDE_CODE_CHILD_SESSION: "",
  }
  const outside = await ccsaver(["doctor"], "", bare)
  assert.match(outside.stdout, /^warn fallback: claude does not run from this shell; /m)
  assert.equal(outside.code, 0)
  const inside = await ccsaver(["doctor"], "", { ...bare, CLAUDE_CODE_CHILD_SESSION: "1" })
  assert.match(inside.stdout, /^FAIL fallback: claude does not run; /m)
  assert.equal(inside.code, 1)
})

test("fallback off shows in doctor without running the binary, and on brings it back", async () => {
  assert.equal((await ccsaver(["fallback", "off"])).stdout, "fallback off\n")
  const off = await ccsaver(["doctor"], "", { CLAUDE_CODE_EXECPATH: join(WORK, "no-such-bin") })
  assert.match(off.stdout, /^ok {3}fallback: off, /m)
  assert.equal(off.code, 0)
  assert.equal((await ccsaver(["fallback", "on"])).stdout, "fallback on\n")
  assert.match(
    (await ccsaver(["doctor"])).stdout,
    /^ok {3}fallback: .*claude \(9\.9\.9 \(fake\)\)$/m,
  )
  assert.equal((await ccsaver(["fallback", "sideways"])).code, 1)
})

test("doctor fails on a missing key, a worker that is down and a broken adapter", async () => {
  const home = join(WORK, "sick-home")
  const dead = await startServer()
  dead.close()
  writeHome(home, {
    plugged: [[PROJECT, "no-such-adapter"]],
    worker: { url: dead.url, model: "cheap-1" },
  })
  const keyless = await ccsaver(["doctor"], "", { CCSAVER_HOME: home })
  assert.equal(keyless.code, 1)
  assert.match(keyless.stdout, /^FAIL key: missing, run: ccsaver key set$/m)
  assert.match(keyless.stdout, /^FAIL plugged: .*project · adapter no-such-adapter not found in /m)
  writeHome(home, { key: OLD_KEY })
  const down = await ccsaver(["doctor"], "", { CCSAVER_HOME: home })
  assert.match(down.stdout, /^FAIL probe: .* is unreachable$/m)
})

test("doctor on a machine with no state only warns, and creates nothing", async () => {
  const home = join(WORK, "no-home")
  const out = await ccsaver(["doctor"], "", { CCSAVER_HOME: home })
  assert.match(out.stdout, /^warn state: .*no-home does not exist yet$/m)
  assert.equal(out.code, 0)
  assert.equal(existsSync(home), false)
})
