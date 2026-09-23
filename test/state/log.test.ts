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
import {
  events,
  type FakeServer,
  fakeClaude,
  HOOK,
  LAUNCHER,
  logged,
  type Ran,
  run,
  startServer,
  tempDir,
  writeHome,
} from "../helpers.ts"

const KEY = "k-log-0123456789-0123456789-0123456789"
const HOME = tempDir("log-home")
const WORK = tempDir("log-work")
const PROJECT = join(WORK, "project")
const LOG = join(HOME, "log")
const SOURCE = join(PROJECT, "source.ts")
const LONG = join(PROJECT, "deep", "long.txt")
const FAKE = fakeClaude(WORK)
const WHOLE = { tool_input: { file_path: LONG } }
const NONE: Record<PropertyKey, unknown> = {}

let server: FakeServer

const hook = (input: unknown): Promise<Ran> =>
  run(
    "node",
    [HOOK],
    { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT, CLAUDE_CODE_SESSION_ID: "" },
    typeof input === "string" ? input : JSON.stringify(input),
  )

const ccsaver = (args: string[], input = ""): Promise<Ran> =>
  run(
    LAUNCHER,
    args,
    { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, CLAUDE_CODE_SESSION_ID: "session-cli" },
    input,
  )

before(async () => {
  server = await startServer()
  mkdirSync(join(PROJECT, "deep"), { recursive: true })
  writeFileSync(SOURCE, "export const CONTENT_SENTINEL = 1\n")
  writeFileSync(LONG, "x\n".repeat(351))
  writeHome(HOME, { plugged: [[PROJECT]], worker: { url: server.url, model: KEY }, key: KEY })
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("records nothing and creates nothing until the log is turned on", async () => {
  assert.match((await hook(WHOLE)).stdout, /"permissionDecision":"deny"/)
  assert.equal(
    (
      await ccsaver([
        "bulk-read",
        "--question=QUESTION_SENTINEL",
        "--project",
        PROJECT,
        "--paths",
        SOURCE,
      ])
    ).code,
    0,
  )
  assert.match((await ccsaver(["doctor"])).stdout, /ok {3}log: off/)
  assert.deepEqual(
    readdirSync(HOME).filter((name) => /log|events/.test(name)),
    [],
  )
})

test("log on makes a private folder, log off sets it aside with its data", async () => {
  assert.equal((await ccsaver(["log", "on"])).stdout, `log on: recording metadata only in ${LOG}\n`)
  assert.equal(statSync(LOG).mode & 0o777, 0o700)
  await hook(WHOLE)
  const [file = ""] = readdirSync(LOG)
  assert.match(file, /^events-\d{4}-\d{2}\.jsonl$/)
  assert.equal(statSync(join(LOG, file)).mode & 0o777, 0o600)
  assert.equal(
    (await ccsaver(["log", "off"])).stdout,
    `log off: the events so far are kept in ${LOG}.off\n`,
  )
  await hook(WHOLE)
  assert.equal(existsSync(LOG), false)
  const kept = readFileSync(join(`${LOG}.off`, file), "utf8")
  assert.equal(kept.split("\n").length - 1, 3)
  await ccsaver(["log", "on"])
  assert.ok(logged(HOME).startsWith(kept))
  assert.deepEqual(
    events(HOME).flatMap(({ kind, on }) => (kind === "config" ? [on] : [])),
    [true, false, true],
  )
  assert.equal((await ccsaver(["log", "sideways"])).code, 1)
})

test("a log that cannot be written changes no decision and no output", async () => {
  const open = await hook(WHOLE)
  const size = logged(HOME).length
  chmodSync(LOG, 0o000)
  const shut = await hook(WHOLE)
  const ranged = await hook({ tool_input: { file_path: LONG, limit: 5 } })
  chmodSync(LOG, 0o700)
  assert.deepEqual([shut.code, shut.stdout], [0, open.stdout])
  assert.deepEqual([ranged.code, ranged.stdout], [0, ""])
  if (process.getuid?.() !== 0) assert.equal(logged(HOME).length, size)
})

test("key set leaves the bare fact, never the key, in the format of every other line", async () => {
  assert.equal((await ccsaver(["key", "set"], `${KEY}\n`)).code, 0)
  const last = events(HOME).at(-1) ?? NONE
  assert.match(String(last["ts"]), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/)
  assert.deepEqual(
    { ...last, ts: 0, pid: 0 },
    { v: 1, ts: 0, kind: "config", session: null, pid: 0, action: "key set" },
  )
  assert.deepEqual([...new Set(events(HOME).map(({ v }) => v))], [last["v"]])
  assert.equal(logged(HOME).includes(KEY), false)
})

test("a command that never reads the key still keeps it out of the log", async () => {
  assert.equal((await ccsaver(["worker", "set", server.url, "cheap-1"])).code, 0)
  assert.equal((await ccsaver(["worker", "set", server.url, KEY])).code, 0)
  const last = events(HOME).at(-1) ?? NONE
  assert.deepEqual([last["action"], last["model"]], ["worker set", "[key]"])
  assert.equal(logged(HOME).includes(KEY), false)
})

test("a mistake in the command line is a fail, never a crash", async () => {
  const before = events(HOME).length
  const typo = await ccsaver(["bulk-read", "--project", PROJECT, "--path", SOURCE])
  const nowhere = await ccsaver(["plug", join(WORK, "nowhere")])
  assert.deepEqual([typo.code, nowhere.code], [1, 1])
  assert.match(typo.stderr, /^Error: Unknown option '--path'/)
  assert.deepEqual(
    events(HOME)
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
    [events(HOME).at(-1)?.["kind"], events(HOME).at(-1)?.["text"]],
    ["fail", out.stderr.slice(7, -1)],
  )
})

test("a line over 4,000 bytes is replaced by a stub that keeps its size", async () => {
  const before = events(HOME).length
  const long = await ccsaver(["bulk-read", `--${"x".repeat(4200)}`])
  assert.equal(long.code, 1)
  const stub = events(HOME).slice(before)[0] ?? NONE
  assert.deepEqual([stub["kind"], stub["text"]], ["fail", undefined])
  assert.ok(Number(stub["dropped"]) > 4000, String(stub["dropped"]))
  assert.equal(logged(HOME).includes("xxxx"), false)
})

test("a session id from outside cannot grow a line past the cap the stub is there for", async () => {
  const before = logged(HOME).length
  await hook({ session_id: "S".repeat(9000), ...WHOLE })
  const written = logged(HOME).slice(before)
  assert.ok(Buffer.byteLength(written) < 4096, String(Buffer.byteLength(written)))
  assert.equal(String(events(HOME).at(-1)?.["session"]).length, 200)
})

test("a stored key under 8 characters is left alone, so unrelated text survives", async () => {
  assert.equal((await ccsaver(["key", "set"], "k-1234\n")).code, 0)
  assert.equal((await ccsaver(["worker", "set", server.url, "k-1234"])).code, 0)
  assert.equal(events(HOME).at(-1)?.["model"], "k-1234")
})
