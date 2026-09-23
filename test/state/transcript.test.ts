import assert from "node:assert/strict"
import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { lastAssistantOf } from "../../src/state/config.store.ts"
import { tempDir } from "../test.helpers.ts"

const WORK = tempDir("transcript-work")
const TRANSCRIPT = join(WORK, "transcript.jsonl")
const USAGE = {
  input_tokens: 2,
  cache_creation_input_tokens: 1_000,
  cache_read_input_tokens: 9_000,
  output_tokens: 50,
}

const said = (row: object): string => JSON.stringify(row)

const assistant = (model: string, usage: object, extra: object = {}): string =>
  said({ type: "assistant", ...extra, message: { role: "assistant", model, usage } })

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
    said({ type: "user", message: { role: "user", content: 'said "model":"claude-haiku-4-5"' } }),
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
  const spoken = { model: "claude-sonnet-5", context: 20_002 }
  assert.deepEqual(lastAssistantOf(path, 1_000_000), spoken)
  const lastThree = rows.slice(2).reduce((sum, row) => sum + row.length + 1, 0)
  assert.deepEqual(lastAssistantOf(path, lastThree + 10), spoken)
  assert.equal(lastAssistantOf(path, lastThree - 10), undefined)
  assert.equal(lastAssistantOf(path, 40), undefined)
})

test("a transcript that is missing, not named, or without usage answers with what it has", () => {
  assert.equal(lastAssistantOf(join(WORK, "gone.jsonl"), 1_000), undefined)
  assert.equal(lastAssistantOf(undefined, 1_000), undefined)
  assert.equal(lastAssistantOf(written("not json", "{}"), 1_000), undefined)
  assert.deepEqual(
    lastAssistantOf(written(assistant("claude-opus-5", { input_tokens: 5 })), 1_000),
    {
      model: "claude-opus-5",
      context: 5,
    },
  )
  assert.deepEqual(
    lastAssistantOf(written(said({ type: "assistant", message: { role: "assistant" } })), 1_000),
    { model: undefined, context: undefined },
  )
})
