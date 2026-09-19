import { existsSync, readFileSync } from "node:fs"
import { relative } from "node:path"
import {
  type Adapter,
  crashed,
  DEFAULT_LIMITS,
  isRecord,
  isUnder,
  loadAdapter,
  logDir,
  pluggedRootOf,
  real,
  record,
} from "./state.ts"

const BYTES_PER_TOKEN = 4
const NUL = 0
const IDS = ["tool_use_id", "agent_id", "agent_type", "permission_mode"]

interface Measured {
  lines: number
  bytes: number
  blind?: "binary" | "unreadable"
}

const measure = (path: string): Measured => {
  try {
    const bytes = readFileSync(path)
    if (bytes.includes(NUL)) return { lines: 0, bytes: bytes.length, blind: "binary" }
    const text = bytes.toString("utf8")
    const breaks = text.split("\n").length
    return { lines: text.endsWith("\n") ? breaks - 1 : breaks, bytes: bytes.length }
  } catch {
    return { lines: 0, bytes: 0, blind: "unreadable" }
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

const gate = (root: string, adapterName: string | undefined): void => {
  const input: unknown = JSON.parse(readFileSync(0, "utf8"))
  const call = isRecord(input) ? input : {}
  const asked = isRecord(call["tool_input"]) ? call["tool_input"] : {}
  const { file_path: given, offset, limit } = asked
  const ranged = offset !== undefined || limit !== undefined
  const logging = existsSync(logDir())
  if (ranged && !logging) return
  const seen = (fields: Record<string, unknown>): void => {
    const ids = IDS.flatMap((name) => (typeof call[name] === "string" ? [[name, call[name]]] : []))
    const ms = Number(performance.now().toFixed(1))
    record("gate", { root, ...fields, ...Object.fromEntries(ids), ms }, call["session_id"])
  }
  if (typeof given !== "string") {
    seen({ decision: "allow", reason: "malformed" })
    return
  }
  const adapter = adapterOrDefaults(adapterName)
  const maxLines = adapter.maxLines ?? DEFAULT_LIMITS.maxLines
  const maxTokens = adapter.maxTokens ?? DEFAULT_LIMITS.maxTokens
  const { lines, bytes, blind } = measure(given)
  const tokens = Math.round(bytes / BYTES_PER_TOKEN)
  const reason = ranged
    ? "range"
    : (blind ?? (lines > maxLines ? "lines" : tokens > maxTokens ? "tokens" : "under"))
  const denied = reason === "lines" || reason === "tokens"
  if (denied)
    deny(
      `${given} has ${lines} lines, ~${tokens} tokens at 4 bytes each, and a whole-file Read measures about twice that (limits ${maxLines} lines, ${maxTokens} tokens). Locate or count with Grep first. When the answer needs the file understood end to end, use the /ccsaver:bulk-reader skill to delegate the read. To edit, Read only the range you need with offset and limit.`,
    )
  if (!logging) return
  const path = real(given)
  seen({
    ...(isUnder(path, root) ? { inside: true, path: relative(root, path) } : { inside: false }),
    ...(typeof offset === "number" ? { offset } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    lines,
    bytes,
    maxLines,
    maxTokens,
    adapter: adapterName ?? null,
    decision: denied ? "deny" : "allow",
    reason,
  })
}

const main = (): void => {
  const project = pluggedRootOf(process.env["CLAUDE_PROJECT_DIR"] || process.cwd())
  if (project === undefined) return
  try {
    gate(project.root, project.adapter)
  } catch (error) {
    crashed("hook", error)
  }
}

try {
  main()
} catch {
  process.exitCode = 0
}
