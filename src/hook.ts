// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { existsSync, readFileSync } from "node:fs"
import { relative } from "node:path"
import {
  type Adapter,
  attempt,
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
const LINE_BREAK = 10
const IDS = ["tool_use_id", "agent_id", "agent_type", "permission_mode"]

interface Measured {
  lines: number
  bytes: number
  blind?: "binary" | "unreadable"
}

const linesIn = (bytes: Buffer): number => {
  let lines = bytes.length > 0 && bytes.at(-1) !== LINE_BREAK ? 1 : 0
  for (let at = bytes.indexOf(LINE_BREAK); at !== -1; at = bytes.indexOf(LINE_BREAK, at + 1))
    lines += 1
  return lines
}

const measure = (path: string): Measured => {
  const bytes = attempt(() => readFileSync(path))
  if (bytes === undefined) return { lines: 0, bytes: 0, blind: "unreadable" }
  return bytes.includes(NUL)
    ? { lines: 0, bytes: bytes.length, blind: "binary" }
    : { lines: linesIn(bytes), bytes: bytes.length }
}

const adapterOrDefaults = (name: string | undefined): Adapter =>
  (name === undefined ? undefined : attempt(() => loadAdapter(name))) ?? {}

const isPresent = (value: unknown): boolean => value !== undefined && value !== null

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
  const ranged = isPresent(offset) || isPresent(limit)
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

try {
  const project = pluggedRootOf(process.env["CLAUDE_PROJECT_DIR"] || process.cwd())
  if (project !== undefined) gate(project.root, project.adapter)
} catch (error) {
  crashed("hook", error)
}
