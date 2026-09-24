// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { existsSync, readFileSync, statSync } from "node:fs"
import { relative } from "node:path"
import { contentRefusal, pathRefusal } from "./delegation/boundary.guard.ts"
import {
  type Adapter,
  BYTES_PER_TOKEN,
  headOf,
  isBinary,
  type Limits,
  lastAssistantOf,
  limitsFrom,
  linesIn,
  loadAdapter,
  pluggedRootOf,
  tokensIn,
} from "./state/config.store.ts"
import { crashed, logDir, record } from "./state/log.store.ts"
import { attempt, isRecord, isUnder, real, stateHome } from "./state/state.store.ts"

const IDS = ["tool_use_id", "agent_id", "agent_type", "permission_mode"]
const TRANSCRIPT_TAIL = 262_144
const SCAN_CEILING = 1_000_000

interface Measured {
  lines?: number
  bytes: number
  blind?: "binary" | "unreadable"
  held?: Buffer
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
    : { lines: linesIn(bytes), bytes: bytes.length, held: bytes }
}

const untakeable = (given: string, at: string, root: string, measured: Measured): boolean => {
  if (pathRefusal(given, at, root, real(stateHome())) !== undefined) return true
  const held =
    measured.held ?? (measured.bytes <= SCAN_CEILING ? attempt(() => readFileSync(at)) : undefined)
  return held !== undefined && contentRefusal(held.toString("utf8")) !== undefined
}

const isOver = (reason: string): boolean => reason === "lines" || reason === "tokens"

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

const reasonOf = (measured: Measured, inside: boolean, ranged: boolean, limits: Limits): string => {
  if (ranged) return "range"
  if (!inside) return "outside"
  if (measured.blind !== undefined) return measured.blind
  if (measured.lines === undefined) return "tokens"
  return measured.lines > limits.maxLines ? "lines" : "under"
}

const denial = (given: string, { lines, bytes }: Measured, limits: Limits): string => {
  const counted =
    lines === undefined ? `${bytes} bytes, too big to count its lines` : `${lines} lines`
  return `${given} has ${counted}, ~${tokensIn(bytes)} tokens at 4 bytes each, and a whole-file Read measures about twice that (limits ${limits.maxLines} lines, ${limits.maxTokens} tokens). Locate or count with Grep first. When the answer needs the file understood end to end, use the /ccsaver:bulk-reader skill to delegate the read. To edit, Read only the range you need with offset and limit.`
}

interface Place {
  inside: boolean
  path?: string
}

const placeOf = (at: string, root: string): Place =>
  isUnder(at, root) ? { inside: true, path: relative(root, at) } : { inside: false }

const rangeOf = (offset: unknown, limit: unknown): Record<string, unknown> => ({
  ...(typeof offset === "number" ? { offset } : {}),
  ...(typeof limit === "number" ? { limit } : {}),
})

const idsOf = (call: Record<PropertyKey, unknown>): Record<string, unknown> =>
  Object.fromEntries(
    IDS.flatMap((name) => (typeof call[name] === "string" ? [[name, call[name]]] : [])),
  )

const spokenOf = (call: Record<PropertyKey, unknown>): Record<string, unknown> => {
  const spoken =
    typeof call["agent_id"] === "string"
      ? undefined
      : lastAssistantOf(call["transcript_path"], TRANSCRIPT_TAIL)
  return { model: spoken?.model ?? null, context: spoken?.context ?? null }
}

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
    const ms = Number(performance.now().toFixed(1))
    record("gate", { root, ...fields, ...idsOf(call), ms }, call["session_id"])
  }
  if (typeof given !== "string") {
    seen({ decision: "allow", reason: "malformed" })
    return
  }
  const limits = limitsOf(adapterName)
  const at = real(given)
  const place = placeOf(at, root)
  const measured = measure(given, limits.maxTokens * BYTES_PER_TOKEN)
  const over = reasonOf(measured, place.inside, ranged, limits)
  const reason = isOver(over) && untakeable(given, at, root, measured) ? "untakeable" : over
  const denied = isOver(reason)
  if (denied) deny(denial(given, measured, limits))
  if (!logging) return
  seen({
    ...place,
    ...rangeOf(offset, limit),
    lines: measured.lines ?? null,
    bytes: measured.bytes,
    ...limits,
    adapter: adapterName ?? null,
    ...spokenOf(call),
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
