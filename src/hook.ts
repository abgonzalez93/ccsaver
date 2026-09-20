// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { existsSync, readFileSync, statSync } from "node:fs"
import { relative } from "node:path"
import {
  type Adapter,
  BYTES_PER_TOKEN,
  headOf,
  isBinary,
  type Limits,
  limitsFrom,
  linesIn,
  loadAdapter,
  pluggedRootOf,
  tailOf,
  tokensIn,
} from "./config.ts"
import { crashed, logDir, record } from "./log.ts"
import { attempt, isRecord, isUnder, parsed, real } from "./state.ts"

const IDS = ["tool_use_id", "agent_id", "agent_type", "permission_mode"]
const TRANSCRIPT_TAIL = 65_536

interface Measured {
  lines?: number
  bytes: number
  blind?: "binary" | "unreadable"
}

const measure = (path: string, maxBytes: number): Measured => {
  const stat = attempt(() => statSync(path))
  if (stat === undefined || !stat.isFile()) return { lines: 0, bytes: 0, blind: "unreadable" }
  if (stat.size > maxBytes) {
    const head = headOf(path)
    if (head === undefined) return { lines: 0, bytes: 0, blind: "unreadable" }
    return isBinary(head) ? { bytes: stat.size, blind: "binary" } : { bytes: stat.size }
  }
  const bytes = attempt(() => readFileSync(path))
  if (bytes === undefined) return { lines: 0, bytes: 0, blind: "unreadable" }
  return isBinary(bytes)
    ? { lines: 0, bytes: bytes.length, blind: "binary" }
    : { lines: linesIn(bytes), bytes: bytes.length }
}

const adapterOrDefaults = (name: string | undefined): Adapter => {
  if (name === undefined) return {}
  try {
    return loadAdapter(name)
  } catch (error) {
    crashed("hook adapter", error)
    return {}
  }
}

const spokenIn = (text: string): string | undefined => {
  let said: string | undefined
  for (const line of text.split("\n")) {
    const row = parsed(line)
    const message = isRecord(row) ? row["message"] : undefined
    if (!isRecord(message) || message["role"] !== "assistant") continue
    const model = message["model"]
    if (typeof model === "string") said = model
  }
  return said
}

const modelOf = (transcript: unknown): string | undefined => {
  if (typeof transcript !== "string") return undefined
  const tail = tailOf(transcript, TRANSCRIPT_TAIL)
  if (tail === undefined) return undefined
  const text = tail.toString("utf8")
  return spokenIn(text.slice(text.indexOf("\n") + 1))
}

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

const reasonOf = (measured: Measured, ranged: boolean, limits: Limits): string => {
  if (ranged) return "range"
  if (measured.blind !== undefined) return measured.blind
  if (measured.lines === undefined) return "tokens"
  return measured.lines > limits.maxLines ? "lines" : "under"
}

const denial = (given: string, { lines, bytes }: Measured, limits: Limits): string => {
  const counted =
    lines === undefined ? `${bytes} bytes, too big to count its lines` : `${lines} lines`
  return `${given} has ${counted}, ~${tokensIn(bytes)} tokens at 4 bytes each, and a whole-file Read measures about twice that (limits ${limits.maxLines} lines, ${limits.maxTokens} tokens). Locate or count with Grep first. When the answer needs the file understood end to end, use the /ccsaver:bulk-reader skill to delegate the read. To edit, Read only the range you need with offset and limit.`
}

const placeOf = (given: string, root: string): Record<string, unknown> => {
  const path = real(given)
  return isUnder(path, root) ? { inside: true, path: relative(root, path) } : { inside: false }
}

const rangeOf = (offset: unknown, limit: unknown): Record<string, unknown> => ({
  ...(typeof offset === "number" ? { offset } : {}),
  ...(typeof limit === "number" ? { limit } : {}),
})

const limitsOf = (name: string | undefined): Limits => limitsFrom(adapterOrDefaults(name))
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
  const limits = limitsOf(adapterName)
  const measured = measure(given, limits.maxTokens * BYTES_PER_TOKEN)
  const reason = reasonOf(measured, ranged, limits)
  const denied = reason === "lines" || reason === "tokens"
  if (denied) deny(denial(given, measured, limits))
  if (!logging) return
  seen({
    ...placeOf(given, root),
    ...rangeOf(offset, limit),
    lines: measured.lines ?? null,
    bytes: measured.bytes,
    ...limits,
    adapter: adapterName ?? null,
    model: modelOf(call["transcript_path"]) ?? null,
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
