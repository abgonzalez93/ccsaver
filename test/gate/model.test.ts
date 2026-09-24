import assert from "node:assert/strict"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { events, HOOK, type Ran, run, tempDir, writeHome } from "../test.helpers.ts"

const HOME = tempDir("model-home")
const WORK = tempDir("model-work")
const PROJECT = join(WORK, "project")
const LONG = join(PROJECT, "long.txt")

mkdirSync(join(HOME, "log"), { recursive: true, mode: 0o700 })
mkdirSync(PROJECT, { recursive: true })
writeFileSync(LONG, "x\n".repeat(351))
writeHome(HOME, { plugged: [[PROJECT]] })

const hook = (input: unknown): Promise<Ran> =>
  run("node", [HOOK], { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT }, JSON.stringify(input))

const said = (role: string, body: object): string => JSON.stringify({ message: { role, ...body } })

after(() => {
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("the gate records the model the session was on, read from the end of its transcript", async () => {
  const transcript = join(WORK, "transcript.jsonl")
  writeFileSync(
    transcript,
    `${[
      said("assistant", { model: "claude-opus-5" }),
      said("user", { content: 'is "model":"claude-fable-5-1" cheaper than opus?' }),
      said("assistant", { model: "claude-sonnet-5" }),
      said("user", { content: "and now?" }),
    ].join("\n")}\n`,
  )
  await hook({ tool_input: { file_path: LONG }, transcript_path: transcript })
  await hook({ tool_input: { file_path: LONG }, transcript_path: join(WORK, "gone.jsonl") })
  await hook({ tool_input: { file_path: LONG } })
  assert.deepEqual(
    events(HOME).map(({ model }) => model),
    ["claude-sonnet-5", null, null],
  )
})

test("a subagent's read records no model, and one tool result over 64 KB does not hide the last assistant line", async () => {
  const transcript = join(WORK, "buried.jsonl")
  const long = said("user", { content: "y".repeat(100_000) })
  writeFileSync(transcript, `${said("assistant", { model: "claude-opus-5" })}\n${long}\n`)
  const before = events(HOME).length
  await hook({ agent_id: "agent-7", tool_input: { file_path: LONG }, transcript_path: transcript })
  await hook({ tool_input: { file_path: LONG }, transcript_path: transcript })
  assert.deepEqual(
    events(HOME)
      .slice(before)
      .map(({ model }) => model),
    [null, "claude-opus-5"],
  )
})

test("the gate records the context the session's last request carried beside the model, and none for a subagent", async () => {
  const transcript = join(WORK, "counted.jsonl")
  const usage = {
    input_tokens: 7,
    cache_creation_input_tokens: 1_000,
    cache_read_input_tokens: 119_000,
    output_tokens: 50,
  }
  writeFileSync(transcript, `${said("assistant", { model: "claude-opus-5", usage })}\n`)
  const before = events(HOME).length
  await hook({ tool_input: { file_path: LONG }, transcript_path: transcript })
  await hook({ agent_id: "agent-7", tool_input: { file_path: LONG }, transcript_path: transcript })
  await hook({ tool_input: { file_path: LONG } })
  assert.deepEqual(
    events(HOME)
      .slice(before)
      .map(({ model, context }) => [model, context]),
    [
      ["claude-opus-5", 120_007],
      [null, null],
      [null, null],
    ],
  )
})
