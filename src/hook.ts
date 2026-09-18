import { readFileSync } from "node:fs"
import { type Adapter, DEFAULT_LIMITS, isRecord, loadAdapter, pluggedRootOf } from "./state.ts"

const BYTES_PER_TOKEN = 4
const NUL = 0

const measure = (path: string): { lines: number; tokens: number } => {
  try {
    const bytes = readFileSync(path)
    if (bytes.includes(NUL)) return { lines: 0, tokens: 0 }
    const text = bytes.toString("utf8")
    const breaks = text.split("\n").length
    return {
      lines: text.endsWith("\n") ? breaks - 1 : breaks,
      tokens: Math.round(bytes.length / BYTES_PER_TOKEN),
    }
  } catch {
    return { lines: 0, tokens: 0 }
  }
}

const adapterOrDefaults = (name: string | undefined): Adapter => {
  try {
    return name === undefined ? {} : loadAdapter(name)
  } catch {
    return {}
  }
}

const deny = (reason: string): void => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  )
}

const main = (): void => {
  const input: unknown = JSON.parse(readFileSync(0, "utf8"))
  if (!isRecord(input) || !isRecord(input["tool_input"])) return
  const { file_path: path, offset, limit } = input["tool_input"]
  if (typeof path !== "string" || offset !== undefined || limit !== undefined) return
  const project = pluggedRootOf(process.env["CLAUDE_PROJECT_DIR"] || process.cwd())
  if (project === undefined) return
  const adapter = adapterOrDefaults(project.adapter)
  const maxLines = adapter.maxLines ?? DEFAULT_LIMITS.maxLines
  const maxTokens = adapter.maxTokens ?? DEFAULT_LIMITS.maxTokens
  const { lines, tokens } = measure(path)
  if (lines <= maxLines && tokens <= maxTokens) return
  deny(
    `${path} has ${lines} lines, ~${tokens} tokens (limits ${maxLines} lines, ${maxTokens} tokens). Locate or count with Grep first. When the answer needs the file understood end to end, use the /ccsaver:bulk-reader skill to delegate the read. To edit, Read only the range you need with offset and limit.`,
  )
}

try {
  main()
} catch {
  process.exitCode = 0
}
