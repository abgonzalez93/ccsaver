import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import {
  AS_ROOT,
  CLI,
  type FakeServer,
  fakeClaude,
  LAUNCHER,
  type Ran,
  run,
  startServer,
  tempDir,
  writeHome,
} from "../test.helpers.ts"

const OLD_KEY = "k-old-0123456789-0123456789-012345678"
const HOME = tempDir("doctor-home")
const WORK = tempDir("doctor-work")
const PROJECT = join(WORK, "project")
const GONE = join(WORK, "gone")
const FAKE = fakeClaude(WORK)

let server: FakeServer

const ccsaver = (args: string[], input = "", env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run(LAUNCHER, args, { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env }, input)

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

test("a plugged list doctor cannot read is one FAIL line, never nothing plugged", {
  skip: AS_ROOT,
}, async () => {
  chmodSync(join(HOME, "plugged"), 0o000)
  const out = await ccsaver(["doctor"])
  chmodSync(join(HOME, "plugged"), 0o600)
  assert.equal(out.code, 1)
  assert.match(out.stdout, /^FAIL plugged: .*plugged cannot be read: check its owner and its mode/m)
  assert.doesNotMatch(out.stdout, /plugged: nothing/)
  assert.match(out.stdout, /^ok {3}state: /m)
  assert.match(out.stdout, /^(ok|warn|FAIL) +fallback: /m)
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
test("doctor stops at a node without import.meta.main, and fails when the hook does not deny", async () => {
  const env = fakeNode("old-node", "20.11.0", false)
  const stopped = await ccsaver(["doctor"], "", env)
  assert.equal(stopped.code, 1)
  assert.equal(
    stopped.stdout,
    "FAIL node: ccsaver needs Node.js 22.18+ or 24.2+, this PATH has v20.11.0\n",
  )
  for (const version of ["22.17.0", "23.9.0", "24.1.0"]) {
    const early = await ccsaver(["doctor"], "", fakeNode(`early-${version}`, version))
    assert.deepEqual(
      [early.code, early.stdout],
      [1, `FAIL node: ccsaver needs Node.js 22.18+ or 24.2+, this PATH has v${version}\n`],
    )
  }
  for (const version of ["22.18.0", "24.2.0"]) {
    const floor = await ccsaver(["doctor"], "", fakeNode(`floor-${version}`, version))
    assert.equal(floor.stdout.includes("FAIL node:"), false, floor.stdout)
  }
  const open = await run(process.execPath, [CLI, "doctor"], {
    CCSAVER_HOME: HOME,
    CLAUDE_CODE_EXECPATH: FAKE,
    ...env,
  })
  assert.equal(open.code, 1)
  assert.match(open.stdout, /^FAIL gate: .*project · the hook let a 351-line read through$/m)
})

test("doctor checks the mode of every file it keeps, not only the key", async () => {
  const files: [string, string][] = [
    ["plugged file", "plugged"],
    ["worker file", "worker.json"],
  ]
  for (const [label, name] of files) {
    const fine = await ccsaver(["doctor"])
    assert.match(fine.stdout, new RegExp(`^ok {3}${label}: .*${name} \\(600\\)$`, "m"))
    chmodSync(join(HOME, name), 0o644)
    const loose = await ccsaver(["doctor"])
    chmodSync(join(HOME, name), 0o600)
    assert.equal(loose.code, 1, label)
    assert.match(loose.stdout, new RegExp(`^FAIL ${label}: .* is 644, expected 600$`, "m"))
  }
})
test("a log doctor cannot read is one FAIL line, not the end of the report", {
  skip: AS_ROOT,
}, async () => {
  assert.equal((await ccsaver(["log", "on"])).code, 0)
  const dir = join(HOME, "log")
  const [name = ""] = readdirSync(dir)
  chmodSync(join(dir, name), 0o000)
  const out = await ccsaver(["doctor"])
  chmodSync(join(dir, name), 0o600)
  assert.equal((await ccsaver(["log", "off"])).code, 0)
  rmSync(`${dir}.off`, { recursive: true, force: true })
  assert.equal(out.code, 1)
  assert.match(out.stdout, new RegExp(`^FAIL log: .*${name} cannot be read`, "m"))
  assert.match(out.stdout, /^ok {3}state: /m)
  assert.match(out.stdout, /^(ok|warn|FAIL) +plugged: /m)
})

test("doctor on a machine with no state only warns, and creates nothing", async () => {
  const home = join(WORK, "no-home")
  const out = await ccsaver(["doctor"], "", { CCSAVER_HOME: home })
  assert.match(out.stdout, /^warn state: .*no-home does not exist yet$/m)
  assert.equal(out.code, 0)
  assert.equal(existsSync(home), false)
})

test("doctor checks prices.json and the adapters folder once they exist, and not before", async () => {
  const quiet = await ccsaver(["doctor"])
  assert.doesNotMatch(quiet.stdout, /prices file:/)
  assert.equal((await ccsaver(["price", "main", "3"])).code, 0)
  assert.equal((await ccsaver(["adapter", "shaped", "maxLines=400"])).code, 0)
  const clean = await ccsaver(["doctor"])
  assert.match(clean.stdout, /^ok {3}prices file: .*prices\.json \(600\)$/m)
  assert.match(clean.stdout, /^ok {3}adapters: .*adapters \(700\)$/m)
  chmodSync(join(HOME, "prices.json"), 0o400)
  chmodSync(join(HOME, "adapters"), 0o500)
  const stricter = await ccsaver(["doctor"])
  assert.match(stricter.stdout, /^ok {3}prices file: .*prices\.json \(400\)$/m)
  assert.match(stricter.stdout, /^ok {3}adapters: .*adapters \(500\)$/m)
  chmodSync(join(HOME, "prices.json"), 0o644)
  chmodSync(join(HOME, "adapters"), 0o755)
  const loose = await ccsaver(["doctor"])
  chmodSync(join(HOME, "adapters"), 0o700)
  assert.equal(loose.code, 1)
  assert.match(loose.stdout, /^FAIL prices file: .* is 644, expected 600$/m)
  assert.match(loose.stdout, /^FAIL adapters: .* is 755, expected 700$/m)
  if (!AS_ROOT) {
    chmodSync(join(HOME, "prices.json"), 0o000)
    const shut = await ccsaver(["doctor"])
    assert.match(shut.stdout, /^FAIL prices file: .* is 0, expected 600$/m)
  }
  chmodSync(join(HOME, "prices.json"), 0o600)
  rmSync(join(HOME, "prices.json"))
})

test("doctor reports the handoff switch, checks its file and folder once they exist, and fails on a file it cannot trust", async () => {
  const quiet = await ccsaver(["doctor"])
  assert.match(quiet.stdout, /^ok {3}handoff: on · 200000 tokens$/m)
  assert.doesNotMatch(quiet.stdout, /handoff file:/)
  assert.equal((await ccsaver(["handoff", "off"])).code, 0)
  assert.equal((await ccsaver(["handoff", "write"], "kept\n")).code, 0)
  const kept = await ccsaver(["doctor"])
  assert.match(kept.stdout, /^ok {3}handoff file: .*handoff\.json \(600\)$/m)
  assert.match(kept.stdout, /^ok {3}handoffs: .*handoff \(700\)$/m)
  assert.match(kept.stdout, /^ok {3}handoff: off · 200000 tokens$/m)
  writeFileSync(join(HOME, "handoff.json"), "{")
  const broken = await ccsaver(["doctor"])
  assert.equal(broken.code, 1)
  assert.match(broken.stdout, /^FAIL handoff: .*handoff\.json is malformed: fix it or delete it$/m)
  rmSync(join(HOME, "handoff.json"))
  rmSync(join(HOME, "handoff"), { recursive: true, force: true })
})
test("doctor says whether the two Bash(ccsaver …) rules are in permissions.allow, and when it cannot tell", async () => {
  const config = tempDir("doctor-config")
  const settings = join(config, "settings.json")
  const checked = (): Promise<Ran> => ccsaver(["doctor"], "", { CLAUDE_CONFIG_DIR: config })
  const allowing = (allow: string[]): void => {
    writeFileSync(settings, JSON.stringify({ permissions: { allow } }))
  }
  const none = await checked()
  assert.match(
    none.stdout,
    /^warn permissions: \S+settings\.json is not there or cannot be read, so the two Bash\(ccsaver …\) rules could not be checked$/m,
  )
  allowing(["Bash(ccsaver bulk-read *)", "Read"])
  const half = await checked()
  assert.match(
    half.stdout,
    /^warn permissions: Bash\(ccsaver code-write \*\) not in permissions\.allow of \S+settings\.json: Claude asks before every delegation, and refuses one in print mode$/m,
  )
  assert.equal(half.code, 0)
  allowing(["Bash(ccsaver bulk-read *)", "Bash(ccsaver code-write *)"])
  assert.match(
    (await checked()).stdout,
    /^ok {3}permissions: the ccsaver rules are in \S+settings\.json$/m,
  )
  allowing(["Bash(ccsaver *)"])
  assert.match((await checked()).stdout, /^ok {3}permissions: /m)
  writeFileSync(settings, "{")
  assert.match(
    (await checked()).stdout,
    /^warn permissions: \S+settings\.json is not JSON, so the two Bash\(ccsaver …\) rules could not be checked$/m,
  )
  rmSync(config, { recursive: true, force: true })
})

test("the rules count in the .claude settings of a plugged project, where don't ask again writes them, and in the :* spelling", async () => {
  const home = tempDir("terminal-rules-home")
  const project = tempDir("terminal-rules-project")
  writeHome(home, { plugged: [[project]] })
  mkdirSync(join(project, ".claude"), { recursive: true })
  const local = join(project, ".claude", "settings.local.json")
  const user = join(WORK, "no-config", "settings.json")
  const allowing = (allow: string[]): void => {
    writeFileSync(local, JSON.stringify({ permissions: { allow } }))
  }
  const checked = (): Promise<Ran> =>
    ccsaver(["doctor"], "", { CCSAVER_HOME: home, CLAUDE_CONFIG_DIR: join(WORK, "no-config") })
  allowing(["Bash(ccsaver bulk-read:*)", "Bash(ccsaver code-write *)"])
  assert.match(
    (await checked()).stdout,
    new RegExp(`^ok {3}permissions: the ccsaver rules are in ${local}$`, "m"),
  )
  allowing(["Bash(ccsaver bulk-read *)"])
  assert.match(
    (await checked()).stdout,
    new RegExp(
      `^warn permissions: Bash\\(ccsaver code-write \\*\\) not in permissions\\.allow of ${user} nor of a plugged project: Claude asks`,
      "m",
    ),
  )
  for (const dir of [home, project]) rmSync(dir, { recursive: true, force: true })
})
