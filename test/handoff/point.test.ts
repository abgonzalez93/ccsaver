import assert from "node:assert/strict"
import { existsSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import {
  askedOf,
  assistant,
  batch,
  contextOf,
  denial,
  handoffs,
  logged,
  MARKERS,
  NONE,
  outputOf,
  prompt,
  QUIET,
  REQUEST,
  specificOf,
  stop,
  tool,
  transcript,
  user,
  wipe,
} from "./handoff.helpers.ts"

after(wipe)

test("below the handoff point every event is silent and leaves no marker", async () => {
  const path = transcript(user(), ...batch(100_000, ["toolu_a", "toolu_b"]))
  assert.deepEqual(await tool(path, "toolu_b"), QUIET)
  assert.deepEqual(await prompt(transcript(user(), assistant(119_989))), QUIET)
  assert.deepEqual(await stop(transcript(user(), assistant(119_989))), QUIET)
  assert.equal(askedOf("session-a"), undefined)
})

test("the first tool call at the point is denied with the skill's text, a notice for the user, a marker and an asked line", async () => {
  const path = transcript(user(), ...batch(120_000, ["toolu_first"]))
  const out = await tool(path, "toolu_first")
  assert.equal(out.code, 0)
  const reason = denial(out)
  assert.match(reason, REQUEST)
  assert.match(reason, /ccsaver handoff write <<'HANDOFF'/)
  assert.doesNotMatch(reason, /^---$|^description:/m)
  assert.equal(
    outputOf(out)["systemMessage"],
    "ccsaver: handing off at 120,010 tokens, the 200,000 limit",
  )
  assert.equal(askedOf("session-a"), "120010\n")
  assert.equal(statSync(join(MARKERS, "session-a.asked")).mode & 0o777, 0o600)
  assert.equal(statSync(MARKERS).mode & 0o777, 0o700)
  const line = logged().at(-1) ?? NONE
  assert.deepEqual(
    ["kind", "action", "context", "output", "limit", "at", "model", "event", "session"].map(
      (key) => line[key],
    ),
    [
      "handoff",
      "asked",
      120_000,
      10,
      200_000,
      120_000,
      "claude-fable-5-1",
      "PreToolUse",
      "session-a",
    ],
  )
})

test("while the handoff is asked, the skill, the three git commands and the write pass, and everything else is denied in a line", async () => {
  const path = transcript(user(), ...batch(121_000, ["toolu_next"]))
  const commands = [
    "git status -sb",
    "git log --oneline -5",
    "git describe --tags --always",
    "ccsaver handoff write <<'HANDOFF'\n# Handoff\nHANDOFF",
  ]
  for (const command of commands)
    assert.deepEqual(
      await tool(path, "toolu_next", "session-a", "Bash", { command }),
      QUIET,
      command,
    )
  assert.deepEqual(
    await tool(path, "toolu_next", "session-a", "Skill", { skill: "ccsaver:handoff" }),
    QUIET,
  )
  assert.match(
    denial(await tool(path, "toolu_next")),
    /^ccsaver: 121,010 tokens in context, past the 120,000 handoff point: only the handoff runs in this session\. git status, git log, git describe and ccsaver handoff write pass; write the handoff now, then end the turn with the line that opens the next session, alone in a code block\.$/,
  )
  assert.match(
    denial(await tool(path, "toolu_next", "session-a", "Read", { file_path: "/x" })),
    /only the handoff runs/,
  )
  const dressed = [
    "git status && rm -rf x",
    "git log | head",
    "git -C /x status",
    "git status > out",
    "git status\nls",
  ]
  for (const command of dressed)
    assert.match(
      denial(await tool(path, "toolu_next", "session-a", "Bash", { command })),
      /only the handoff runs/,
      command,
    )
  assert.match(
    denial(await tool(path, "toolu_next", "session-a", "Skill", { skill: "ccsaver:doctor" })),
    /only the handoff runs/,
  )
  assert.deepEqual(await stop(transcript(user(), assistant(121_000))), QUIET)
  assert.equal(handoffs("asked").length, 1)
})

test("once the handoff is written, every tool is denied with the line to paste, the next prompt is answered with it, and the end of the turn records done", async () => {
  const asked = join(MARKERS, "session-a.asked")
  const earlier = (Date.now() - 60_000) / 1000
  utimesSync(asked, earlier, earlier)
  writeFileSync(join(MARKERS, "session-a.md"), "# Handoff\n")
  const path = transcript(user(), ...batch(122_000, ["toolu_after"]))
  assert.match(
    denial(await tool(path, "toolu_after", "session-a", "Bash", { command: "git status" })),
    /^ccsaver: this session was handed off at 122,010 tokens, the 200,000 limit\. End the turn with this line alone in a code block, nothing after it: Read \S+session-a\.md whole, then continue from its next step$/,
  )
  const answered = outputOf(await prompt(transcript(user(), assistant(122_000))))
  assert.equal(answered["decision"], "block")
  assert.match(
    String(answered["reason"]),
    /^ccsaver: this session was handed off at 122,010 tokens, the 200,000 limit\. Paste this in a new session: Read \S+session-a\.md whole, then continue from its next step\. ccsaver handoff <tokens> raises the limit; ccsaver handoff off unlocks this session\.$/,
  )
  assert.deepEqual(await stop(transcript(user(), assistant(122_000))), QUIET)
  const done = logged().at(-1) ?? NONE
  assert.deepEqual(
    ["kind", "action", "context", "output", "limit", "asked", "session"].map((key) => done[key]),
    ["handoff", "done", 122_000, 10, 200_000, 120_010, "session-a"],
  )
})

test("a crossing inside a batch of parallel calls asks once: the first call carries the request, the others one line", async () => {
  const ids = ["toolu_x", "toolu_y", "toolu_z"]
  const path = transcript(user(), ...batch(120_000, ids))
  const before = handoffs("asked").length
  const [first, ...rest] = await Promise.all(ids.map((id) => tool(path, id, "session-m")))
  assert.match(denial(first ?? QUIET), REQUEST)
  assert.equal(typeof outputOf(first ?? QUIET)["systemMessage"], "string")
  for (const out of rest) {
    assert.match(denial(out), /only the handoff runs/)
    assert.equal(outputOf(out)["systemMessage"], undefined)
  }
  assert.deepEqual([handoffs("asked").length - before, askedOf("session-m")], [1, "120010\n"])
})

test("a context back under the point, after a compaction or a raised limit, clears the marker and starts over", async () => {
  const path = transcript(user(), ...batch(90_000, ["toolu_low"]))
  assert.deepEqual(await tool(path, "toolu_low"), QUIET)
  assert.equal(existsSync(join(MARKERS, "session-a.asked")), false)
  assert.deepEqual(await prompt(transcript(user(), assistant(90_000))), QUIET)
  const up = transcript(user(), ...batch(150_000, ["toolu_up"]))
  assert.match(denial(await tool(up, "toolu_up")), /150,010 tokens/)
  rmSync(join(MARKERS, "session-a.asked"))
})

test("a turn that ends without a tool at the point asks through the stop hook, and never while a stop hook is already continuing", async () => {
  const path = transcript(user(), assistant(120_000))
  const out = await stop(path, "session-c")
  assert.equal(specificOf(out)["hookEventName"], "Stop")
  assert.match(contextOf(out), REQUEST)
  assert.equal(askedOf("session-c"), "120010\n")
  assert.equal(handoffs("asked").at(-1)?.["event"], "Stop")
  assert.deepEqual(await stop(path, "session-d", true), QUIET)
  assert.equal(askedOf("session-d"), undefined)
})

test("a prompt at the point with nothing asked yet asks alongside it and goes through, once", async () => {
  const before = handoffs("asked").length
  const path = transcript(user(), assistant(130_000))
  const out = await prompt(path, "session-e")
  assert.equal(specificOf(out)["hookEventName"], "UserPromptSubmit")
  assert.match(contextOf(out), /has 130,010 tokens in context/)
  assert.equal(outputOf(out)["decision"], undefined)
  assert.equal(askedOf("session-e"), "130010\n")
  assert.equal(handoffs("asked").at(-1)?.["event"], "UserPromptSubmit")
  assert.match(contextOf(await prompt(path, "session-e")), /130,010/)
  assert.equal(handoffs("asked").length, before + 1)
})
