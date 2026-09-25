import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { isRecord } from "../../src/state/state.store.ts"
import {
  assistantLine,
  events,
  HANDOFF,
  type Line,
  type Ran,
  run,
  tempDir,
  writeHome,
} from "../test.helpers.ts"

export const HOME = tempDir("handoff-home")
export const WORK = tempDir("handoff-work")
const PROJECT = join(WORK, "project")
export const MARKERS = join(HOME, "handoff")
export const NONE: Record<PropertyKey, unknown> = {}
export const QUIET = { code: 0, stdout: "", stderr: "" }
export const REQUEST =
  /^ccsaver: claude-fable-5-1 has 120,010 tokens in context, its last response counted, at the 120,000 handoff point of the 200,000 limit\. No other tool runs in this session until the handoff is written; write it now, this way\.\n\n/

mkdirSync(PROJECT, { recursive: true })
writeHome(HOME, { plugged: [[PROJECT]] })
mkdirSync(join(HOME, "log"), { recursive: true, mode: 0o700 })
chmodSync(join(HOME, "log"), 0o700)

export const wipe = (): void => {
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
}

export const assistant = (context: number, said: Line = {}): string =>
  assistantLine({ context, ...said })

export const batch = (context: number, tools: string[], output = 10): string[] =>
  tools.map((tool) => assistant(context, { tool, output, request: `req_${context}` }))

export const SYNTHETIC = assistantLine({
  model: "<synthetic>",
  usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
})

let written = 0
export const transcript = (...rows: string[]): string => {
  const path = join(WORK, `transcript-${written++}.jsonl`)
  writeFileSync(path, `${rows.join("\n")}\n`)
  return path
}

export const hook = (input: unknown): Promise<Ran> =>
  run(
    "node",
    [HANDOFF],
    { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT },
    typeof input === "string" ? input : JSON.stringify(input),
  )

export const event = (
  name: string,
  transcript_path: string | undefined,
  session_id: string | null,
  rest: object = {},
): Promise<Ran> =>
  hook({
    hook_event_name: name,
    ...(session_id === null ? {} : { session_id }),
    ...(transcript_path === undefined ? {} : { transcript_path }),
    ...rest,
  })

export const stop = (
  path: string | undefined,
  session: string | null = "session-a",
  active = false,
): Promise<Ran> => event("Stop", path, session, { stop_hook_active: active })

export const tool = (
  path: string | undefined,
  id: string,
  session: string | null = "session-a",
  tool_name = "Bash",
  tool_input: object = { command: "ls" },
): Promise<Ran> => event("PreToolUse", path, session, { tool_name, tool_input, tool_use_id: id })

export const prompt = (
  path: string | undefined,
  session: string | null = "session-a",
): Promise<Ran> => event("UserPromptSubmit", path, session, { prompt: "go on" })

export const outputOf = (out: Ran): Record<PropertyKey, unknown> => {
  const raw: unknown = JSON.parse(out.stdout)
  return isRecord(raw) ? raw : {}
}

export const specificOf = (out: Ran): Record<PropertyKey, unknown> => {
  const held = outputOf(out)["hookSpecificOutput"]
  return isRecord(held) ? held : {}
}

export const contextOf = (out: Ran): string => String(specificOf(out)["additionalContext"])

export const denial = (out: Ran): string => {
  const specific = specificOf(out)
  return specific["permissionDecision"] === "deny"
    ? String(specific["permissionDecisionReason"])
    : ""
}

export const askedOf = (session: string): string | undefined => {
  const place = join(MARKERS, `${session}.asked`)
  return existsSync(place) ? readFileSync(place, "utf8") : undefined
}

export const logged = (): Record<PropertyKey, unknown>[] => events(HOME)

export const crashes = (): number => logged().filter(({ kind }) => kind === "crash").length

export const handoffs = (action: string): Record<PropertyKey, unknown>[] =>
  logged().filter(({ kind, action: did }) => kind === "handoff" && did === action)
