// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs"
import { relative } from "node:path"
import { type Adapter, DEFAULT_LIMITS, loadAdapter, pluggedRootOf } from "./config.ts"
import { crashed, logDir, record } from "./log.ts"
import { attempt, isRecord, isUnder, real } from "./state.ts"

const BYTES_PER_TOKEN = 4
const NUL = 0
const LINE_BREAK = 10
const HEAD_BYTES = 8192
const IDS = ["tool_use_id", "agent_id", "agent_type", "permission_mode"]

interface Limits {
  maxLines: number
  maxTokens: number
}

interface Measured {
  lines?: number
  bytes: number
  blind?: "binary" | "unreadable"
}

const linesIn = (bytes: Buffer): number => {
  let lines = bytes.length > 0 && bytes.at(-1) !== LINE_BREAK ? 1 : 0
  for (let at = bytes.indexOf(LINE_BREAK); at !== -1; at = bytes.indexOf(LINE_BREAK, at + 1))
    lines += 1
  return lines
}

const headOf = (path: string): Buffer | undefined => {
  const fd = attempt(() => openSync(path, "r"))
  if (fd === undefined) return undefined
  const head = Buffer.alloc(HEAD_BYTES)
  const read = attempt(() => readSync(fd, head, 0, HEAD_BYTES, 0))
  attempt(() => closeSync(fd))
  return read === undefined ? undefined : head.subarray(0, read)
}

const measure = (path: string, maxBytes: number): Measured => {
  const size = attempt(() => statSync(path).size)
  if (size === undefined) return { lines: 0, bytes: 0, blind: "unreadable" }
  if (size > maxBytes) {
    const head = headOf(path)
    if (head === undefined) return { lines: 0, bytes: 0, blind: "unreadable" }
    return head.includes(NUL) ? { bytes: size, blind: "binary" } : { bytes: size }
  }
  const bytes = attempt(() => readFileSync(path))
  if (bytes === undefined) return { lines: 0, bytes: 0, blind: "unreadable" }
  return bytes.includes(NUL)
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

const tokensIn = (bytes: number): number => Math.round(bytes / BYTES_PER_TOKEN)

const reasonOf = (measured: Measured, ranged: boolean, limits: Limits): string => {
  if (ranged) return "range"
  if (measured.blind !== undefined) return measured.blind
  if (measured.lines !== undefined && measured.lines > limits.maxLines) return "lines"
  return tokensIn(measured.bytes) > limits.maxTokens ? "tokens" : "under"
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

const limitsOf = (name: string | undefined): Limits => {
  const adapter = adapterOrDefaults(name)
  return {
    maxLines: adapter.maxLines ?? DEFAULT_LIMITS.maxLines,
    maxTokens: adapter.maxTokens ?? DEFAULT_LIMITS.maxTokens,
  }
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
