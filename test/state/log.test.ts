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
  VERSION,
  writeHome,
} from "../test.helpers.ts"

const KEY = "k-log-0123456789-0123456789-0123456789"
const HOME = tempDir("log-home")
const WORK = tempDir("log-work")
const PROJECT = join(WORK, "project")
const LOG = join(HOME, "log")
const SOURCE = join(PROJECT, "source.ts")
const LONG = join(PROJECT, "deep", "long.txt")
const OUTSIDE = join(WORK, "outside.txt")
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

const ask = (...paths: string[]): Promise<Ran> =>
  ccsaver(["bulk-read", "--question=QUESTION_SENTINEL", "--project", PROJECT, "--paths", ...paths])

before(async () => {
  server = await startServer()
  mkdirSync(join(PROJECT, "deep"), { recursive: true })
  writeFileSync(SOURCE, "export const CONTENT_SENTINEL = 1\n")
  writeFileSync(LONG, "x\n".repeat(351))
  writeFileSync(OUTSIDE, "x\n")
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

test("key set leaves the bare fact and the session, never the key, in the format of every other line", async () => {
  assert.equal((await ccsaver(["key", "set"], `${KEY}\n`)).code, 0)
  const last = events(HOME).at(-1) ?? NONE
  assert.match(String(last["ts"]), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/)
  assert.deepEqual(
    { ...last, ts: 0, pid: 0 },
    { v: 1, ts: 0, kind: "config", session: "session-cli", pid: 0, by: VERSION, action: "key set" },
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
      ["fail", "worker claude needs a path, or auto"],
    ],
  )
})

test("the input tokens the endpoint reports are recorded, and its silence is not a zero", async () => {
  const before = events(HOME).length
  server.reply.inTokens = 4242
  assert.equal((await ask(SOURCE)).code, 0)
  server.reset()
  assert.equal((await ask(SOURCE)).code, 0)
  server.reply.inTokens = -5
  assert.equal((await ask(SOURCE)).code, 0)
  const [reported, silent, negative] = events(HOME)
    .slice(before)
    .filter(({ kind }) => kind === "delegate")
    .map(({ inTokens }) => inTokens)
  assert.deepEqual([reported, silent, negative], [4242, undefined, undefined])
})

test("a stored key under 8 characters is left alone, so unrelated text survives", async () => {
  assert.equal((await ccsaver(["key", "set"], "k-1234\n")).code, 0)
  assert.equal((await ccsaver(["worker", "set", server.url, "k-1234"])).code, 0)
  assert.equal(events(HOME).at(-1)?.["model"], "k-1234")
})
