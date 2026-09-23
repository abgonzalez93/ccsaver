import assert from "node:assert/strict"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { isRecord } from "../../src/state/state.store.ts"
import { AS_ROOT, events, HANDOFF, type Ran, run, tempDir, writeHome } from "../test.helpers.ts"

const HOME = tempDir("handoff-home")
const WORK = tempDir("handoff-work")
const PROJECT = join(WORK, "project")
const MARKERS = join(HOME, "handoff")
const NONE: Record<PropertyKey, unknown> = {}
const DAY = 86_400_000

mkdirSync(PROJECT, { recursive: true })
writeHome(HOME, { plugged: [[PROJECT]] })
mkdirSync(join(HOME, "log"), { recursive: true, mode: 0o700 })
chmodSync(join(HOME, "log"), 0o700)

const said = (row: object): string => JSON.stringify(row)

const assistant = (context: number, extra: object = {}, model = "claude-fable-5-1"): string =>
  said({
    type: "assistant",
    isSidechain: false,
    requestId: `req_${context}`,
    ...extra,
    message: {
      role: "assistant",
      model,
      content: [{ type: "text", text: "x" }],
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 1_000,
        cache_read_input_tokens: context - 1_002,
        output_tokens: 10,
      },
    },
  })

const SYNTHETIC = said({
  type: "assistant",
  message: {
    role: "assistant",
    model: "<synthetic>",
    usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  },
})

const user = (text = "x"): string =>
  said({ type: "user", isSidechain: false, message: { role: "user", content: text } })

let written = 0
const transcript = (...rows: string[]): string => {
  const path = join(WORK, `transcript-${written++}.jsonl`)
  writeFileSync(path, `${rows.join("\n")}\n`)
  return path
}

const hook = (input: unknown): Promise<Ran> =>
  run(
    "node",
    [HANDOFF],
    { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT },
    typeof input === "string" ? input : JSON.stringify(input),
  )

const stop = (
  transcript_path: string | undefined,
  session_id: string | null = "session-a",
): Promise<Ran> =>
  hook({
    hook_event_name: "Stop",
    stop_hook_active: false,
    ...(session_id === null ? {} : { session_id }),
    ...(transcript_path === undefined ? {} : { transcript_path }),
  })

const message = (out: Ran): string => {
  const raw: unknown = JSON.parse(out.stdout)
  const said = isRecord(raw) ? raw["systemMessage"] : undefined
  return typeof said === "string" ? said : ""
}

const tierOf = (session: string): string | undefined => {
  const place = join(MARKERS, `${session}.tier`)
  return existsSync(place) ? readFileSync(place, "utf8") : undefined
}

const crashes = (): number => events(HOME).filter(({ kind }) => kind === "crash").length

after(() => {
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("warns once when the context passes the limit, with the model and the tokens, and again only at the next multiple of the limit", async () => {
  const under = await stop(transcript(user(), assistant(199_999)))
  assert.deepEqual([under.code, under.stdout, tierOf("session-a")], [0, "", undefined])
  const crossed = await stop(transcript(user(), assistant(200_000)))
  assert.equal(crossed.code, 0)
  assert.match(
    message(crossed),
    /^ccsaver: claude-fable-5-1 has 200,000 tokens in context, past the 200,000 handoff limit\. Run \/ccsaver:handoff to write a handoff /,
  )
  assert.equal(tierOf("session-a"), "1\n")
  assert.equal(statSync(join(MARKERS, "session-a.tier")).mode & 0o777, 0o600)
  assert.equal(statSync(MARKERS).mode & 0o777, 0o700)
  const same = await stop(transcript(user(), assistant(399_999)))
  assert.deepEqual([same.code, same.stdout], [0, ""])
  const twice = await stop(transcript(user(), assistant(400_000)))
  assert.match(message(twice), /has 400,000 tokens in context, past 2× the 200,000 handoff limit\./)
  assert.equal(tierOf("session-a"), "2\n")
})

test("a compacted session arms the warning again", async () => {
  const fell = await stop(transcript(user(), assistant(90_000)))
  assert.deepEqual([fell.code, fell.stdout, tierOf("session-a")], [0, "", "0\n"])
  const again = await stop(transcript(user(), assistant(210_000)))
  assert.match(message(again), /210,000 tokens in context, past the 200,000 handoff limit/)
  assert.equal(tierOf("session-a"), "1\n")
})

test("the last main-chain line decides: a subagent's line and a synthetic one after it do not count", async () => {
  const path = transcript(
    user(),
    assistant(300_000),
    assistant(999_999, { isSidechain: true }, "claude-haiku-4-5"),
    SYNTHETIC,
  )
  assert.match(message(await stop(path, "session-b")), /claude-fable-5-1 has 300,000 tokens/)
})

test("a transcript that is missing, unreadable, of another shape, or cut before its last usage leaves the turn in silence, with no crash", async () => {
  const before = crashes()
  const quiet = { code: 0, stdout: "", stderr: "" }
  const paths = [
    undefined,
    join(WORK, "gone.jsonl"),
    transcript("not json at all", "{}"),
    transcript(user(), user()),
    transcript(user(), assistant(500_000), user("y".repeat(300_000))),
  ]
  for (const path of paths) assert.deepEqual(await stop(path, "session-c"), quiet, String(path))
  assert.deepEqual(await stop(transcript(user(), assistant(500_000)), null), quiet)
  if (!AS_ROOT) {
    const shut = transcript(user(), assistant(500_000))
    chmodSync(shut, 0o000)
    assert.deepEqual(await stop(shut, "session-c"), quiet)
  }
  assert.deepEqual([crashes(), tierOf("session-c")], [before, undefined])
})

test("input that is not JSON leaves a crash and nothing on stdout", async () => {
  const out = await hook("not json")
  assert.deepEqual([out.code, out.stdout], [0, ""])
  const { kind, where, name } = events(HOME).at(-1) ?? NONE
  assert.deepEqual([kind, where, name], ["crash", "handoff", "SyntaxError"])
})

test("handoff.json off keeps the hook quiet, a limit of its own moves the line, and a broken one leaves a crash and silence", async () => {
  const file = join(HOME, "handoff.json")
  writeFileSync(file, JSON.stringify({ on: false, limit: 200_000 }))
  assert.equal((await stop(transcript(user(), assistant(300_000)), "session-d")).stdout, "")
  writeFileSync(file, JSON.stringify({ limit: 100_000 }))
  assert.match(
    message(await stop(transcript(user(), assistant(150_000)), "session-d")),
    /150,000 tokens in context, past the 100,000 handoff limit/,
  )
  const before = crashes()
  writeFileSync(file, '{"on": tru}')
  const broken = await stop(transcript(user(), assistant(900_000)), "session-d")
  assert.deepEqual(broken, { code: 0, stdout: "", stderr: "" })
  assert.equal(crashes(), before + 1)
  assert.match(String(events(HOME).at(-1)?.["message"]), /handoff\.json is malformed/)
  rmSync(file)
})

test("a warning is a handoff event while the log is on, with the session it belongs to", async () => {
  const out = await stop(transcript(user(), assistant(250_000, {}, "claude-opus-5")), "session-e")
  assert.notEqual(message(out), "")
  const { kind, action, context, limit, tier, model, session } = events(HOME).at(-1) ?? NONE
  assert.deepEqual(
    [kind, action, context, limit, tier, model, session],
    ["handoff", "warned", 250_000, 200_000, 1, "claude-opus-5", "session-e"],
  )
})

test("markers of other sessions older than seven days are swept when a marker is written", async () => {
  const old = join(MARKERS, "session-old.tier")
  const fresh = join(MARKERS, "session-fresh.tier")
  writeFileSync(old, "1\n")
  writeFileSync(fresh, "1\n")
  const eightDaysAgo = (Date.now() - 8 * DAY) / 1000
  utimesSync(old, eightDaysAgo, eightDaysAgo)
  await stop(transcript(user(), assistant(200_000)), "session-f")
  assert.deepEqual([existsSync(old), existsSync(fresh), tierOf("session-f")], [false, true, "1\n"])
})

test("a session id that is no file name is made one before it names a marker", async () => {
  await stop(transcript(user(), assistant(200_000)), "../../etc/x y")
  assert.equal(tierOf("..-..-etc-x-y"), "1\n")
})
