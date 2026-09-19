import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import {
  CLI,
  type FakeServer,
  fakeClaude,
  LAUNCHER,
  type Ran,
  run,
  startServer,
  tempDir,
  writeHome,
} from "./helpers.ts"

const OLD_KEY = "k-old-0123456789-0123456789-012345678"
const NEW_KEY = "k-new-9876543210-9876543210-987654321"

const HOME = tempDir("doctor-home")
const WORK = tempDir("doctor-work")
const PROJECT = join(WORK, "project")
const GONE = join(WORK, "gone")
const FAKE = fakeClaude(WORK)

let server: FakeServer

const ccsaver = (args: string[], input = "", env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run(LAUNCHER, args, { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env }, input)

const everything = (out: Ran): string => `${out.stdout}${out.stderr}`

before(async () => {
  server = await startServer()
  for (const dir of [PROJECT, GONE]) mkdirSync(dir, { recursive: true })
  writeHome(HOME, {
    plugged: [[PROJECT, "strict-ts"], [GONE]],
    worker: { url: server.url, model: "cheap-1" },
    key: OLD_KEY,
  })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
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
  assert.ok(server.seen.at(-1)?.body.includes('"temperature":0.2,"max_tokens":8192,'))
  for (const out of [rejected, accepted]) {
    assert.equal(everything(out).includes(OLD_KEY), false)
    assert.equal(everything(out).includes(NEW_KEY), false)
    assert.equal(
      out.stdout.split("\n").find((line) => line.includes(" key: ")),
      `ok   key: ${join(HOME, "api-key")} (600)`,
    )
  }
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

const fakeNode = (label: string, version: string, runs = true): NodeJS.ProcessEnv => {
  const bin = join(WORK, label)
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(bin, "node"),
    [
      "#!/bin/sh",
      `[ "$1" = --version ] && echo v${version} && exit 0`,
      ...(runs
        ? [
            `[ "$1" = -e ] && exec ${process.execPath} -e "Object.defineProperty(process.versions,'node',{value:'${version}'}); $2"`,
            `exec ${process.execPath} "$@"`,
          ]
        : ["exit 1"]),
      "",
    ].join("\n"),
  )
  chmodSync(join(bin, "node"), 0o755)
  return { PATH: `${bin}:${process.env["PATH"] ?? ""}` }
}
test("doctor stops at a node under 24.2, and fails when the hook does not deny", async () => {
  const env = fakeNode("old-node", "20.11.0", false)
  const stopped = await ccsaver(["doctor"], "", env)
  assert.equal(stopped.code, 1)
  assert.equal(
    stopped.stdout,
    "FAIL node: ccsaver needs Node.js 24.2 or newer, this PATH has v20.11.0\n",
  )
  const early = await ccsaver(["doctor"], "", fakeNode("early-node", "24.1.0"))
  assert.deepEqual(
    [early.code, early.stdout],
    [1, "FAIL node: ccsaver needs Node.js 24.2 or newer, this PATH has v24.1.0\n"],
  )
  const floor = await ccsaver(["doctor"], "", fakeNode("floor-node", "24.2.0"))
  assert.equal(floor.stdout.includes("FAIL node:"), false, floor.stdout)
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

test("doctor tells a key it cannot read from a key that is not there", async () => {
  if (process.getuid?.() === 0) return
  const home = join(WORK, "locked-home")
  writeHome(home, { worker: { url: server.url, model: "cheap-1" }, key: OLD_KEY })
  chmodSync(join(home, "api-key"), 0o000)
  const out = await ccsaver(["doctor"], "", { CCSAVER_HOME: home })
  chmodSync(join(home, "api-key"), 0o600)
  assert.equal(out.code, 1)
  assert.match(out.stdout, /^FAIL key: .*api-key cannot be read/m)
  assert.equal(out.stdout.includes("key: missing"), false)
})

test("doctor on a machine with no state only warns, and creates nothing", async () => {
  const home = join(WORK, "no-home")
  const out = await ccsaver(["doctor"], "", { CCSAVER_HOME: home })
  assert.match(out.stdout, /^warn state: .*no-home does not exist yet$/m)
  assert.equal(out.code, 0)
  assert.equal(existsSync(home), false)
})
