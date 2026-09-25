import assert from "node:assert/strict"
import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { lastAssistantOf, type Spoken } from "../../src/measure/transcript.reader.ts"
import { assistantLine, tempDir, userLine } from "../test.helpers.ts"

const WORK = tempDir("transcript-work")
const TRANSCRIPT = join(WORK, "transcript.jsonl")
const AT = "2026-09-25T10:00:00.000Z"
const USAGE = {
  input_tokens: 2,
  cache_creation_input_tokens: 1_000,
  cache_read_input_tokens: 9_000,
  output_tokens: 50,
}

const assistant = (model: string, usage: object, extra: object = {}): string =>
  assistantLine({ model, usage, extra, request: `req-${model}`, at: AT })

const spokenOf = (model: string, context: number, whole: boolean): Spoken => ({
  model,
  context,
  output: 50,
  stopReason: "end_turn",
  toolUses: [],
  at: Date.parse(AT),
  whole,
})

const written = (...rows: string[]): string => {
  writeFileSync(TRANSCRIPT, `${rows.join("\n")}\n`)
  return TRANSCRIPT
}

after(() => {
  rmSync(WORK, { recursive: true, force: true })
})

test("the transcript reader takes the last main-chain assistant line, its model and the tokens in its context, over a subagent's line and a synthetic one", () => {
  const rows = [
    assistant("claude-opus-5", USAGE),
    userLine('said "model":"claude-haiku-4-5"'),
    assistant("claude-sonnet-5", { ...USAGE, cache_read_input_tokens: 19_000 }),
    assistant(
      "claude-haiku-4-5",
      { ...USAGE, cache_read_input_tokens: 99_000 },
      { isSidechain: true },
    ),
    assistant("<synthetic>", {
      input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }),
  ]
  const path = written(...rows)
  assert.deepEqual(lastAssistantOf(path, 1_000_000), spokenOf("claude-sonnet-5", 20_002, true))
  const lastThree = rows.slice(2).reduce((sum, row) => sum + row.length + 1, 0)
  assert.deepEqual(
    lastAssistantOf(path, lastThree + 10),
    spokenOf("claude-sonnet-5", 20_002, false),
  )
  assert.equal(lastAssistantOf(path, lastThree - 10), undefined)
  assert.equal(lastAssistantOf(path, 40), undefined)
})

test("the last assistant line is found past the 16 KB read first, through the 256 KB read after it", () => {
  const long = userLine("x".repeat(20_000))
  const path = written(assistant("claude-opus-5", USAGE), long)
  const spoken = spokenOf("claude-opus-5", 10_002, true)
  assert.deepEqual(lastAssistantOf(path, 262_144), spoken)
  assert.deepEqual(lastAssistantOf(path, 30_000), spoken)
  assert.equal(lastAssistantOf(path, 16_384), undefined)
  assert.deepEqual(
    lastAssistantOf(written(long, assistant("claude-opus-5", USAGE)), 262_144),
    spokenOf("claude-opus-5", 10_002, false),
  )
})

test("a response read whole gives its output, its stop reason, its tool ids in order and its time; one cut by the 16 KB read is read again for the id it looks for", () => {
  const block = (id: string, input: object = {}): object => ({
    type: "tool_use",
    id,
    name: "Bash",
    input,
  })
  const line = (blocks: object[]): string =>
    assistantLine({ blocks, stop: "tool_use", request: "req-1", at: AT, usage: USAGE })
  const path = written(
    userLine("y".repeat(20_000)),
    line([{ type: "thinking", thinking: "t" }]),
    line([block("toolu_1")]),
    line([block("toolu_2")]),
  )
  const near = lastAssistantOf(path, 262_144)
  assert.deepEqual(
    [near?.output, near?.stopReason, near?.toolUses, near?.at, near?.whole],
    [50, "tool_use", ["toolu_1", "toolu_2"], Date.parse(AT), false],
  )
  assert.deepEqual(lastAssistantOf(path, 262_144, "toolu_2")?.whole, true)
  const wide = written(
    userLine(),
    line([block("toolu_a", { command: "z".repeat(20_000) })]),
    line([block("toolu_b")]),
  )
  assert.deepEqual(lastAssistantOf(wide, 262_144)?.toolUses, ["toolu_b"])
  assert.deepEqual(lastAssistantOf(wide, 262_144, "toolu_b")?.toolUses, ["toolu_a", "toolu_b"])
})

test("a transcript that is missing, not named, or without usage answers with what it has", () => {
  assert.equal(lastAssistantOf(join(WORK, "gone.jsonl"), 1_000), undefined)
  assert.equal(lastAssistantOf(undefined, 1_000), undefined)
  assert.equal(lastAssistantOf(written("not json", "{}"), 1_000), undefined)
  assert.deepEqual(
    lastAssistantOf(written(assistant("claude-opus-5", { input_tokens: 5 })), 1_000),
    { ...spokenOf("claude-opus-5", 5, true), output: undefined },
  )
  const bare = JSON.stringify({ type: "assistant", message: { role: "assistant" } })
  assert.deepEqual(lastAssistantOf(written(bare), 1_000), {
    ...spokenOf("", 0, true),
    model: undefined,
    context: undefined,
    output: undefined,
    stopReason: undefined,
    at: undefined,
  })
})
