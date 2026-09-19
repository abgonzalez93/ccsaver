import assert from "node:assert/strict"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { isRecord } from "../src/state.ts"
import {
  type FakeServer,
  fakeClaude,
  GATE,
  HOOK,
  LAUNCHER,
  type Ran,
  run,
  startServer,
  tempDir,
  writeHome,
} from "./helpers.ts"

const KEY = "k-log-0123456789-0123456789-0123456789"
const HOME = tempDir("log-home")
const WORK = tempDir("log-work")
const PROJECT = join(WORK, "project")
const UNPLUGGED = join(WORK, "unplugged")
const LOG = join(HOME, "log")
const SOURCE = join(PROJECT, "source.ts")
const LONG = join(PROJECT, "deep", "long.txt")
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

const logged = (): string =>
  existsSync(LOG)
    ? readdirSync(LOG)
        .map((name) => readFileSync(join(LOG, name), "utf8"))
        .join("")
    : ""

const events = (): Record<PropertyKey, unknown>[] =>
  logged()
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const event: unknown = JSON.parse(line)
      assert.ok(isRecord(event))
      return event
    })

before(async () => {
  server = await startServer()
  for (const dir of [join(PROJECT, "deep"), UNPLUGGED]) mkdirSync(dir, { recursive: true })
  writeFileSync(SOURCE, "export const CONTENT_SENTINEL = 1\n")
  writeFileSync(LONG, "x\n".repeat(351))
  writeFileSync(HEAVY, `${"word ".repeat(8000)}\n`)
  writeFileSync(BLOB, Buffer.from([120, 10, 0]))
  writeFileSync(OUTSIDE, "x\n")
  writeHome(HOME, { plugged: [[PROJECT]], worker: { url: server.url, model: KEY }, key: KEY })
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("records nothing and creates nothing until the log is turned on", async () => {
  assert.match((await hook(WHOLE)).stdout, /"permissionDecision":"deny"/)
  assert.equal((await ask(SOURCE)).code, 0)
  assert.match((await ccsaver(["doctor"])).stdout, /ok {3}log: off/)
  assert.deepEqual(
    readdirSync(HOME).filter((name) => /log|events/.test(name)),
    [],
  )
})

test("log on makes a private folder, log off sets it aside with its data", async () => {
  assert.equal((await ccsaver(["log", "on"])).stdout, "log on\n")
  assert.equal(statSync(LOG).mode & 0o777, 0o700)
  await hook(WHOLE)
  const [file = ""] = readdirSync(LOG)
  assert.match(file, /^events-\d{4}-\d{2}\.jsonl$/)
  assert.equal(statSync(join(LOG, file)).mode & 0o777, 0o600)
  assert.equal((await ccsaver(["log", "off"])).stdout, "log off\n")
  await hook(WHOLE)
  assert.equal(existsSync(LOG), false)
  const kept = readFileSync(join(`${LOG}.off`, file), "utf8")
  assert.equal(kept.split("\n").length - 1, 3)
  await ccsaver(["log", "on"])
  assert.ok(logged().startsWith(kept))
  assert.deepEqual(
    events().flatMap(({ kind, on }) => (kind === "config" ? [on] : [])),
    [true, false, true],
  )
  assert.equal((await ccsaver(["log", "sideways"])).code, 1)
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
  const before = events().length
  for (const [tool_input] of cases) await hook({ ...call, tool_input })
  const seen = events().slice(before)
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

test("an unplugged project records nothing, not even a crash", async () => {
  const size = logged().length
  await hook(WHOLE, UNPLUGGED)
  await hook("not json", UNPLUGGED)
  const env = { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: UNPLUGGED }
  await run("sh", [GATE], env, JSON.stringify(WHOLE))
  assert.equal(logged().length, size)
})

test("a crash inside the hook is recorded and the read still goes through", async () => {
  const out = await hook("not json")
  assert.deepEqual([out.code, out.stdout], [0, ""])
  const { kind, where, name, stack } = events().at(-1) ?? NONE
  assert.deepEqual(
    [kind, where, name, Array.isArray(stack)],
    ["crash", "hook", "SyntaxError", true],
  )
})

test("a log that cannot be written changes no decision and no output", async () => {
  const open = await hook(WHOLE)
  const size = logged().length
  chmodSync(LOG, 0o000)
  const shut = await hook(WHOLE)
  const ranged = await hook({ tool_input: { file_path: LONG, limit: 5 } })
  chmodSync(LOG, 0o700)
  assert.deepEqual([shut.code, shut.stdout], [0, open.stdout])
  assert.deepEqual([ranged.code, ranged.stdout], [0, ""])
  if (process.getuid?.() !== 0) assert.equal(logged().length, size)
})

test("a delegation leaves metadata: no key, no question, no file content, no answer", async () => {
  const before = events().length
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
  const seen = events().slice(before)
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
  const text = logged()
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

test("doctor says whether the log is on, records its tally and marks its own probe", async () => {
  const out = await ccsaver(["doctor"])
  assert.match(out.stdout, /ok {3}log: on · \S+log \(700\) · \d+ bytes this month/)
  const seen = events()
  const { ok, warn, fail } = seen.findLast(({ kind }) => kind === "doctor") ?? NONE
  assert.deepEqual([ok, warn, fail], [out.stdout.split("\n").length - 1, 0, 0])
  assert.equal(seen.at(-2)?.["tool_use_id"], "doctor")
  chmodSync(LOG, 0o755)
  assert.match((await ccsaver(["doctor"])).stdout, /FAIL log: /)
  chmodSync(LOG, 0o700)
})

test("key set leaves the bare fact, never the key, in the format of every other line", async () => {
  assert.equal((await ccsaver(["key", "set"], `${KEY}\n`)).code, 0)
  const last = events().at(-1) ?? NONE
  assert.match(String(last["ts"]), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/)
  assert.deepEqual(
    { ...last, ts: 0, pid: 0 },
    { v: 1, ts: 0, kind: "config", session: null, pid: 0, action: "key set" },
  )
  assert.deepEqual([...new Set(events().map(({ v }) => v))], [last["v"]])
  assert.equal(logged().includes(KEY), false)
})

test("a command that never reads the key still keeps it out of the log", async () => {
  assert.equal((await ccsaver(["worker", "set", server.url, KEY])).code, 0)
  const last = events().at(-1) ?? NONE
  assert.deepEqual([last["action"], last["model"]], ["worker set", "[key]"])
  assert.equal(logged().includes(KEY), false)
})

test("a mistake in the command line is a fail, never a crash", async () => {
  const before = events().length
  const typo = await ccsaver(["bulk-read", "--project", PROJECT, "--path", SOURCE])
  const nowhere = await ccsaver(["plug", join(WORK, "nowhere")])
  assert.deepEqual([typo.code, nowhere.code], [1, 1])
  assert.match(typo.stderr, /^Error: Unknown option '--path'/)
  assert.deepEqual(
    events()
      .slice(before)
      .map(({ kind }) => kind),
    ["fail", "delegate", "fail"],
  )
})

test("log off refuses to bury an older log.off, and says so in the log it keeps", async () => {
  mkdirSync(`${LOG}.off`)
  const out = await ccsaver(["log", "off"])
  rmSync(`${LOG}.off`, { recursive: true })
  assert.equal(out.code, 1)
  assert.match(out.stderr, /^Error: .*log\.off already exists: move it away/)
  assert.equal(existsSync(LOG), true)
  assert.deepEqual(
    [events().at(-1)?.["kind"], events().at(-1)?.["text"]],
    ["fail", out.stderr.slice(7, -1)],
  )
})

test("a line over 4,000 bytes is replaced by a stub that keeps its size", async () => {
  const before = events().length
  const long = await ccsaver(["bulk-read", `--${"x".repeat(4200)}`])
  assert.equal(long.code, 1)
  const stub = events().slice(before)[0] ?? NONE
  assert.deepEqual([stub["kind"], stub["text"]], ["fail", undefined])
  assert.ok(Number(stub["dropped"]) > 4000, String(stub["dropped"]))
  assert.equal(logged().includes("xxxx"), false)
})

test("a stored key under 8 characters is left alone, so unrelated text survives", async () => {
  assert.equal((await ccsaver(["key", "set"], "k-1234\n")).code, 0)
  assert.equal((await ccsaver(["worker", "set", server.url, "k-1234"])).code, 0)
  assert.equal(events().at(-1)?.["model"], "k-1234")
})
