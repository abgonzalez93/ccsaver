// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { existsSync, readFileSync, statSync } from "node:fs"
import { relative } from "node:path"
import { contentRefusal, pathRefusal } from "./boundary/boundary.guard.ts"
import {
  BYTES_PER_TOKEN,
  headOf,
  isBinary,
  type Limits,
  linesIn,
  type Reason,
  SCAN_CEILING,
  tokensIn,
} from "./measure/measure.helpers.ts"
import { lastAssistantOf } from "./measure/transcript.reader.ts"
import { type Adapter, limitsFrom, loadAdapter, pluggedRootOf } from "./state/config.store.ts"
import { crashed, logDir, record } from "./state/log.store.ts"
import { attempt, isRecord, isUnder, real, stateHome } from "./state/state.store.ts"

const IDS = ["tool_use_id", "agent_id", "agent_type", "permission_mode"]
const TRANSCRIPT_TAIL = 262_144

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

const isOver = (reason: Reason): boolean => reason === "lines" || reason === "tokens"

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

const reasonOf = (measured: Measured, inside: boolean, ranged: boolean, limits: Limits): Reason => {
  if (ranged) return "range"
  if (!inside) return "outside"
  if (measured.blind !== undefined) return measured.blind
  if (measured.lines === undefined) return "tokens"
  return measured.lines > limits.maxLines ? "lines" : "under"
}

const sized = (given: string, { lines, bytes }: Measured, limits: Limits): string => {
  const counted =
    lines === undefined ? `${bytes} bytes, too big to count its lines` : `${lines} lines`
  return `${given} has ${counted}, ~${tokensIn(bytes)} tokens by bytes/4 and about twice that as a Read (limits ${limits.maxLines} lines, ${limits.maxTokens} tokens)`
}

const denial = (given: string, measured: Measured, limits: Limits): string =>
  `${sized(given, measured, limits)}: Grep to locate, /ccsaver:bulk-reader to understand it whole, a ranged Read with offset and limit to edit.`

const cut = (given: string, measured: Measured, limits: Limits): string =>
  `${sized(given, measured, limits)}: this Read was cut to lines 1-${limits.maxLines}. Grep to locate, /ccsaver:bulk-reader to understand it whole, a ranged Read with offset and limit for the rest.`

const rewrite = (
  asked: Record<PropertyKey, unknown>,
  given: string,
  measured: Measured,
  limits: Limits,
): void => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...asked, offset: 1, limit: limits.maxLines },
        additionalContext: cut(given, measured, limits),
      },
    }),
  )
}

interface Place {
  inside: boolean
  path?: string
}

const placeOf = (at: string, root: string): Place =>
  isUnder(at, root) ? { inside: true, path: relative(root, at) } : { inside: false }

const rangeOf = (offset: unknown, limit: unknown, pages: unknown): Record<string, unknown> => ({
  ...(typeof offset === "number" ? { offset } : {}),
  ...(typeof limit === "number" ? { limit } : {}),
  ...(typeof pages === "string" || typeof pages === "number" ? { pages } : {}),
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

const kindOf = (call: Record<PropertyKey, unknown>): string =>
  call["tool_use_id"] === "doctor" ? "doctor" : "gate"

const seen = (
  call: Record<PropertyKey, unknown>,
  root: string,
  fields: Record<string, unknown>,
): void => {
  const ms = Number(performance.now().toFixed(1))
  record(kindOf(call), { root, ...fields, ...idsOf(call), ms }, call["session_id"])
}

type Decision = "allow" | "deny" | "rewrite"

const answered = (
  asked: Record<PropertyKey, unknown>,
  given: string,
  measured: Measured,
  limits: Limits,
  rewriting: boolean,
  reason: Reason,
): Decision => {
  if (!isOver(reason)) return "allow"
  if (rewriting) {
    rewrite(asked, given, measured, limits)
    return "rewrite"
  }
  deny(denial(given, measured, limits))
  return "deny"
}

const gate = (root: string, adapterName: string | undefined): void => {
  const input: unknown = JSON.parse(readFileSync(0, "utf8"))
  const call = isRecord(input) ? input : {}
  const asked = isRecord(call["tool_input"]) ? call["tool_input"] : {}
  const { file_path: given, offset, limit, pages } = asked
  const ranged = isPresent(offset) || isPresent(limit) || isPresent(pages)
  const logging = existsSync(logDir())
  if (ranged && !logging) return
  if (typeof given !== "string") {
    seen(call, root, { decision: "allow", reason: "malformed" })
    return
  }
  const adapter = adapterOrDefaults(adapterName)
  const limits = limitsFrom(adapter)
  const at = real(given)
  const place = placeOf(at, root)
  const measured = measure(given, limits.maxTokens * BYTES_PER_TOKEN)
  const over = reasonOf(measured, place.inside, ranged, limits)
  const reason = isOver(over) && untakeable(given, at, root, measured) ? "untakeable" : over
  const decision = answered(asked, given, measured, limits, adapter.rewrite === true, reason)
  if (!logging) return
  seen(call, root, {
    ...place,
    ...(decision === "rewrite"
      ? { offset: 1, limit: limits.maxLines }
      : rangeOf(offset, limit, pages)),
    lines: measured.lines ?? null,
    bytes: measured.bytes,
    ...limits,
    adapter: adapterName ?? null,
    ...spokenOf(call),
    decision,
    reason,
  })
}

try {
  const project = pluggedRootOf(process.env["CLAUDE_PROJECT_DIR"] || process.cwd())
  if (project !== undefined) gate(project.root, project.adapter)
} catch (error) {
  crashed("hook", error)
}
