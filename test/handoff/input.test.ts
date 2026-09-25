import assert from "node:assert/strict"
import { appendFileSync, chmodSync, existsSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { AS_ROOT } from "../test.helpers.ts"
import {
  askedOf,
  assistant,
  batch,
  contextOf,
  crashes,
  denial,
  event,
  HOME,
  handoffs,
  hook,
  logged,
  MARKERS,
  NONE,
  QUIET,
  SYNTHETIC,
  stop,
  tool,
  transcript,
  user,
  WORK,
  wipe,
} from "./handoff.helpers.ts"

const DAY = 86_400_000

after(wipe)

test("a batch near the point is cut: the calls that fit pass, the rest are denied, and one held line records the batch", async () => {
  const ids = ["toolu_0", "toolu_1", "toolu_2", "toolu_3"]
  const path = transcript(user(), ...batch(105_000, ids, 0))
  const outs = await Promise.all(ids.map((id) => tool(path, id, "session-b")))
  assert.deepEqual(outs.slice(0, 2), [QUIET, QUIET])
  for (const out of outs.slice(2))
    assert.match(
      denial(out),
      /^ccsaver: 105,000 tokens in context, near the 120,000 handoff point: this batch was cut to 2 calls; call the rest again, fewer at a time\.$/,
    )
  const held = handoffs("held")
  assert.equal(held.length, 1)
  assert.deepEqual(
    ["context", "output", "batch", "passed", "session"].map((key) => held[0]?.[key]),
    [105_000, 0, 4, 2, "session-b"],
  )
  const far = transcript(user(), ...batch(60_000, ids))
  for (const id of ids) assert.deepEqual(await tool(far, id, "session-b"), QUIET, id)
  assert.equal(askedOf("session-b"), undefined)
})

test("the hook waits for the transcript to catch up, and after two seconds decides with what is there", async () => {
  const path = transcript(user(), ...batch(100_000, ["toolu_old"]))
  const late = tool(path, "toolu_late", "session-f")
  setTimeout(() => appendFileSync(path, `${batch(125_000, ["toolu_late"]).join("\n")}\n`), 200)
  assert.match(denial(await late), /has 125,010 tokens in context/)
  assert.equal(askedOf("session-f"), "125010\n")
  const landed = handoffs("waited").at(-1) ?? NONE
  assert.deepEqual(
    [landed["event"], landed["landed"], landed["session"]],
    ["PreToolUse", true, "session-f"],
  )
  assert.ok(Number(landed["ms"]) >= 150)
  const turn = transcript(user(), ...batch(119_000, ["toolu_mid"]))
  const ending = stop(turn, "session-g")
  setTimeout(() => appendFileSync(turn, `${assistant(126_000)}\n`), 200)
  assert.match(contextOf(await ending), /has 126,000 tokens|has 126,010 tokens/)
  const started = Date.now()
  const there = transcript(user(), ...batch(100_000, ["toolu_there"]))
  assert.deepEqual(await tool(there, "toolu_missing", "session-h"), QUIET)
  assert.ok(Date.now() - started >= 2_000)
  const gaveUp = handoffs("waited").at(-1) ?? NONE
  assert.deepEqual([gaveUp["landed"], Number(gaveUp["ms"]) >= 2_000], [false, true])
  assert.equal(handoffs("waited").filter(({ session }) => session === "session-b").length, 0)
})

test("a subagent's call is left alone, whatever the session's context", async () => {
  const path = transcript(user(), ...batch(500_000, ["toolu_sub"]))
  const out = await event("PreToolUse", path, "session-a", {
    agent_id: "agent-1",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    tool_use_id: "toolu_sub",
  })
  assert.deepEqual([out, askedOf("session-a")], [QUIET, undefined])
})

test("the last main-chain line decides: a subagent's line and a synthetic one after it do not count", async () => {
  const path = transcript(
    user(),
    assistant(300_000),
    assistant(999_999, { extra: { isSidechain: true }, model: "claude-haiku-4-5" }),
    SYNTHETIC,
  )
  assert.match(contextOf(await stop(path, "session-i")), /claude-fable-5-1 has 300,010 tokens/)
})

test("a transcript that is missing, unreadable, of another shape, or cut before its last usage leaves the event in silence, with no crash", async () => {
  const before = crashes()
  const paths = [
    undefined,
    join(WORK, "gone.jsonl"),
    transcript("not json at all", "{}"),
    transcript(user(), user()),
    transcript(user(), assistant(500_000), user("y".repeat(300_000))),
  ]
  for (const path of paths) {
    assert.deepEqual(await stop(path, "session-j"), QUIET, String(path))
    assert.deepEqual(await tool(path, "toolu_j", "session-j"), QUIET, String(path))
  }
  assert.deepEqual(await stop(transcript(user(), assistant(500_000)), null), QUIET)
  if (!AS_ROOT) {
    const shut = transcript(user(), assistant(500_000))
    chmodSync(shut, 0o000)
    assert.deepEqual(await stop(shut, "session-j"), QUIET)
  }
  assert.deepEqual([crashes(), askedOf("session-j")], [before, undefined])
})

test("input that is not JSON leaves a crash and nothing on stdout", async () => {
  const out = await hook("not json")
  assert.deepEqual([out.code, out.stdout], [0, ""])
  const { kind, where, name } = logged().at(-1) ?? NONE
  assert.deepEqual([kind, where, name], ["crash", "handoff", "SyntaxError"])
})

test("handoff.json off keeps the hook quiet, a limit of its own moves the point, and a broken one leaves a crash and silence", async () => {
  const file = join(HOME, "handoff.json")
  writeFileSync(file, JSON.stringify({ on: false, limit: 200_000 }))
  assert.deepEqual(await stop(transcript(user(), assistant(300_000)), "session-k"), QUIET)
  writeFileSync(file, JSON.stringify({ limit: 150_000 }))
  assert.match(
    contextOf(await stop(transcript(user(), assistant(80_000)), "session-k")),
    /has 80,010 tokens in context, its last response counted, at the 70,000 handoff point of the 150,000 limit/,
  )
  const before = crashes()
  writeFileSync(file, '{"on": tru}')
  assert.deepEqual(await stop(transcript(user(), assistant(900_000)), "session-k"), QUIET)
  assert.equal(crashes(), before + 1)
  assert.match(String(logged().at(-1)?.["message"]), /handoff\.json is malformed/)
  rmSync(file)
})

test("markers of other sessions older than seven days are swept when a marker is written, and a kept handoff never is", async () => {
  const old = join(MARKERS, "session-old.asked")
  const tier = join(MARKERS, "session-old.tier")
  const fresh = join(MARKERS, "session-fresh.asked")
  const kept = join(MARKERS, "session-old.md")
  for (const place of [old, tier, fresh, kept]) writeFileSync(place, "1\n")
  const eightDaysAgo = (Date.now() - 8 * DAY) / 1000
  for (const place of [old, tier, kept]) utimesSync(place, eightDaysAgo, eightDaysAgo)
  await stop(transcript(user(), assistant(200_000)), "session-l")
  assert.deepEqual(
    [existsSync(old), existsSync(tier), existsSync(fresh), existsSync(kept), askedOf("session-l")],
    [false, false, true, true, "200010\n"],
  )
})

test("a session id that is no file name is made one before it names a marker", async () => {
  await stop(transcript(user(), assistant(200_000)), "../../etc/x y")
  assert.equal(askedOf("..-..-etc-x-y"), "200010\n")
})
