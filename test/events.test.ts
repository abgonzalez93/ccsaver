import assert from "node:assert/strict"
import { chmodSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import {
  events,
  type FakeServer,
  fakeClaude,
  GATE,
  HOOK,
  LAUNCHER,
  logged,
  type Ran,
  run,
  startServer,
  tempDir,
  writeHome,
} from "./helpers.ts"

const KEY = "k-events-0123456789-0123456789-0123"
const HOME = tempDir("events-home")
const WORK = tempDir("events-work")
const PROJECT = join(WORK, "project")
const UNPLUGGED = join(WORK, "unplugged")
const BROKEN = join(WORK, "broken")
const LOG = join(HOME, "log")
const SOURCE = join(PROJECT, "source.ts")
const LONG = join(PROJECT, "deep", "long.txt")
const LONGER = join(PROJECT, "deep", "longer.txt")
const HEAVY = join(PROJECT, "heavy.md")
const BLOB = join(PROJECT, "blob.bin")
const OUTSIDE = join(WORK, "outside.txt")
const FAKE = fakeClaude(WORK)
const WHOLE = { tool_input: { file_path: LONG } }
const NONE: Record<PropertyKey, unknown> = {}

let server: FakeServer

const hook = (input: unknown, project = PROJECT): Promise<Ran> =>
  run(
    "node",
    [HOOK],
    { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: project, CLAUDE_CODE_SESSION_ID: "" },
    typeof input === "string" ? input : JSON.stringify(input),
  )

const ccsaver = (args: string[], input = ""): Promise<Ran> =>
  run(
    LAUNCHER,
    args,
    { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, CLAUDE_CODE_SESSION_ID: "session-cli" },
    input,
  )

const ask = (...paths: string[]): Promise<Ran> =>
  ccsaver(["bulk-read", "--question=QUESTION_SENTINEL", "--project", PROJECT, "--paths", ...paths])

before(async () => {
  server = await startServer()
  for (const dir of [join(PROJECT, "deep"), UNPLUGGED, BROKEN, join(HOME, "adapters")])
    mkdirSync(dir, { recursive: true })
  writeFileSync(SOURCE, "export const CONTENT_SENTINEL = 1\n")
  writeFileSync(LONG, "x\n".repeat(351))
  writeFileSync(LONGER, "x\n".repeat(401))
  writeFileSync(HEAVY, `${"word ".repeat(8000)}\n`)
  writeFileSync(BLOB, Buffer.from([120, 10, 0]))
  writeFileSync(OUTSIDE, "x\n")
  writeFileSync(join(HOME, "adapters", "broken.json"), JSON.stringify({ maxLines: "abc" }))
  writeHome(HOME, { plugged: [[PROJECT]], worker: { url: server.url, model: KEY }, key: KEY })
  mkdirSync(LOG, { recursive: true, mode: 0o700 })
  chmodSync(LOG, 0o700)
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("one gate event per decision, with the ids of the call", async () => {
  const ids = {
    tool_use_id: "toolu_1",
    permission_mode: "default",
    agent_id: "agent-7",
    agent_type: "Explore",
  }
  const call = { session_id: "session-hook", ...ids }
  const cases: [unknown, string, string][] = [
    [{ file_path: LONG }, "deny", "lines"],
    [{ file_path: HEAVY }, "deny", "tokens"],
    [{ file_path: SOURCE }, "allow", "under"],
    [{ file_path: LONG, offset: 10, limit: 5 }, "allow", "range"],
    [{ file_path: BLOB }, "allow", "binary"],
    [{ file_path: join(PROJECT, "missing.txt") }, "allow", "unreadable"],
    ["nope", "allow", "malformed"],
    [{ file_path: OUTSIDE }, "allow", "under"],
  ]
  const before = events(HOME).length
  for (const [tool_input] of cases) await hook({ ...call, tool_input })
  const seen = events(HOME).slice(before)
  assert.deepEqual(
    seen.map(({ decision, reason }) => [decision, reason]),
    cases.map(([, decision, reason]) => [decision, reason]),
  )
  assert.deepEqual(
    { ...seen[0], ts: 0, pid: 0, ms: 0 },
    {
      v: 1,
      ts: 0,
      kind: "gate",
      session: "session-hook",
      pid: 0,
      root: PROJECT,
      inside: true,
      path: "deep/long.txt",
      lines: 351,
      bytes: 702,
      maxLines: 350,
      maxTokens: 8000,
      adapter: null,
      decision: "deny",
      reason: "lines",
      ...ids,
      ms: 0,
    },
  )
  assert.deepEqual(seen.map(({ offset, limit, lines }) => [offset, limit, lines])[3], [10, 5, 351])
  assert.deepEqual([seen[7]?.["inside"], seen[7]?.["path"]], [false, undefined])
})

test("an adapter the hook cannot load leaves a crash next to the gate event it explains", async () => {
  const before = events(HOME).length
  writeHome(HOME, { plugged: [[PROJECT], [BROKEN, "broken"]] })
  const out = await hook({ tool_input: { file_path: LONG } }, BROKEN)
  writeHome(HOME, { plugged: [[PROJECT]] })
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  const [crash, gate] = events(HOME).slice(before)
  assert.deepEqual([crash?.["kind"], crash?.["where"]], ["crash", "hook adapter"])
  assert.match(String(crash?.["message"]), /broken is malformed/)
  assert.deepEqual(
    [gate?.["adapter"], gate?.["maxLines"], gate?.["reason"]],
    ["broken", 350, "lines"],
  )
})

test("an unplugged project records nothing, not even a crash", async () => {
  const size = logged(HOME).length
  await hook(WHOLE, UNPLUGGED)
  await hook("not json", UNPLUGGED)
  const env = { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: UNPLUGGED }
  await run("sh", [GATE], env, JSON.stringify(WHOLE))
  assert.equal(logged(HOME).length, size)
})

test("a crash inside the hook is recorded and the read still goes through", async () => {
  const out = await hook("not json")
  assert.deepEqual([out.code, out.stdout], [0, ""])
  const { kind, where, name, stack } = events(HOME).at(-1) ?? NONE
  assert.deepEqual(
    [kind, where, name, Array.isArray(stack)],
    ["crash", "hook", "SyntaxError", true],
  )
})

test("a delegation leaves metadata: no key, no question, no file content, no answer", async () => {
  const before = events(HOME).length
  const sent = server.seen.length
  const [file = ""] = readdirSync(LOG)
  writeFileSync(join(PROJECT, ".env"), "TOKEN=1\n")
  assert.equal((await ask(SOURCE)).code, 0)
  server.reply.status = 500
  assert.equal((await ask(SOURCE, OUTSIDE)).code, 0)
  assert.equal((await ask(SOURCE)).code, 0)
  server.reset()
  assert.equal((await ask(join(PROJECT, ".env"))).code, 1)
  assert.match((await ask(join(LOG, file))).stderr, /state folder/)
  const written = await ccsaver([
    "code-write",
    "--spec=SPEC_SENTINEL",
    "--project",
    PROJECT,
    "--reference",
    SOURCE,
    "--target",
    join(PROJECT, "out.ts"),
  ])
  assert.equal(written.code, 0)
  const seen = events(HOME).slice(before)
  assert.deepEqual(
    seen
      .filter(({ kind }) => kind === "delegate")
      .map(({ mode, answered, fell, status, files, outside, exit, target, written: lines }) => [
        mode,
        answered,
        fell,
        status,
        files,
        outside,
        exit,
        target,
        lines,
      ]),
    [
      ["bulk-read", "external", undefined, 200, 1, 0, 0, undefined, undefined],
      ["bulk-read", "fallback", "outside", undefined, 2, 1, 0, undefined, undefined],
      ["bulk-read", "fallback", "status", 500, 1, 0, 0, undefined, undefined],
      ["bulk-read", undefined, undefined, undefined, undefined, undefined, 1, undefined, undefined],
      ["bulk-read", undefined, undefined, undefined, undefined, undefined, 1, undefined, undefined],
      ["code-write", "external", undefined, 200, 1, 0, 0, true, 1],
    ],
  )
  assert.equal(
    seen.every(({ session }) => session === "session-cli"),
    true,
  )
  assert.deepEqual([...new Set(seen.map(({ kind }) => kind))].sort(), ["delegate", "fail", "note"])
  assert.equal(server.seen.length - sent, 3)
  const text = logged(HOME)
  for (const banned of [
    KEY,
    "Bearer",
    "QUESTION_SENTINEL",
    "SPEC_SENTINEL",
    "CONTENT_SENTINEL",
    "FROM-EXTERNAL",
    "FROM-CLAUDE",
  ])
    assert.equal(text.includes(banned), false, banned)
  assert.match(text, /\| external \| \[key\] \|/)
})

test("doctor counts the month's denied reads and leaves its own probe out of them", async () => {
  const fresh = tempDir("events-denied")
  mkdirSync(join(fresh, "log"), { recursive: true, mode: 0o700 })
  chmodSync(join(fresh, "log"), 0o700)
  writeHome(fresh, { plugged: [[PROJECT]] })
  const home = { CCSAVER_HOME: fresh, CLAUDE_PROJECT_DIR: PROJECT, CLAUDE_CODE_SESSION_ID: "" }
  const seen = (input: unknown): Promise<Ran> => run("node", [HOOK], home, JSON.stringify(input))
  await seen(WHOLE)
  await seen(WHOLE)
  await seen({ tool_input: { file_path: LONGER } })
  await seen({ tool_input: { file_path: LONGER } })
  await seen({ tool_input: { file_path: SOURCE } })
  await seen({ tool_input: { file_path: LONG, offset: 10 } })
  const out = await run(LAUNCHER, ["doctor"], { CCSAVER_HOME: fresh, CLAUDE_CODE_EXECPATH: FAKE })
  assert.match(
    out.stdout,
    /^ok {3}denied: 4 of 5 whole-file reads this month \(80 %\), median 376 lines$/m,
  )
  rmSync(fresh, { recursive: true, force: true })
})

test("a command line that goes nowhere leaves a fail, and says which kind", async () => {
  const before = events(HOME).length
  assert.equal((await ccsaver(["frobnicate"])).code, 1)
  assert.equal((await ccsaver(["worker", "claude"])).code, 1)
  assert.deepEqual(
    events(HOME)
      .slice(before)
      .map(({ kind, text }) => [kind, text]),
    [
      ["fail", "unknown command: frobnicate"],
      ["fail", "wrong arguments: worker"],
    ],
  )
})

test("doctor says nothing about denied reads while the log is off", async () => {
  const quiet = tempDir("events-quiet")
  writeHome(quiet, { plugged: [[PROJECT]] })
  const out = await run(LAUNCHER, ["doctor"], { CCSAVER_HOME: quiet, CLAUDE_CODE_EXECPATH: FAKE })
  assert.doesNotMatch(out.stdout, /denied:/)
  rmSync(quiet, { recursive: true, force: true })
})

test("doctor says whether the log is on, records its tally and marks its own probe", async () => {
  const out = await ccsaver(["doctor"])
  assert.match(out.stdout, /ok {3}log: on · \S+log \(700\) · \d+ bytes this month/)
  const seen = events(HOME)
  const { ok, warn, fail } = seen.findLast(({ kind }) => kind === "doctor") ?? NONE
  assert.deepEqual([ok, warn, fail], [out.stdout.split("\n").length - 1, 0, 0])
  assert.equal(seen.at(-2)?.["tool_use_id"], "doctor")
  chmodSync(LOG, 0o755)
  assert.match((await ccsaver(["doctor"])).stdout, /FAIL log: /)
  chmodSync(LOG, 0o700)
})

test("the input tokens the endpoint reports are recorded, and its silence is not a zero", async () => {
  const before = events(HOME).length
  server.reply.inTokens = 4242
  assert.equal((await ask(SOURCE)).code, 0)
  server.reset()
  assert.equal((await ask(SOURCE)).code, 0)
  const [reported, silent] = events(HOME)
    .slice(before)
    .filter(({ kind }) => kind === "delegate")
    .map(({ inTokens }) => inTokens)
  assert.deepEqual([reported, silent], [4242, undefined])
})
