import { closeSync, fstatSync, openSync, readSync } from "node:fs"
import { attempt, isRecord, parsed } from "../state/state.store.ts"

const tailOf = (path: string, bytes: number): Buffer | undefined => {
  const fd = attempt(() => openSync(path, "r"))
  if (fd === undefined) return undefined
  const size = attempt(() => fstatSync(fd).size) ?? 0
  const tail = Buffer.alloc(Math.min(bytes, size))
  const read = attempt(() => readSync(fd, tail, 0, tail.length, Math.max(0, size - bytes)))
  attempt(() => closeSync(fd))
  return read === undefined ? undefined : tail.subarray(0, read)
}

export interface Spoken {
  model: string | undefined
  context: number | undefined
  output: number | undefined
  stopReason: string | undefined
  toolUses: string[]
  at: number | undefined
  whole: boolean
}

const SYNTHETIC = "<synthetic>"
const CONTEXT_PARTS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]

const countIn = (usage: unknown, part: string): number | undefined => {
  const held = isRecord(usage) ? usage[part] : undefined
  return typeof held === "number" ? held : undefined
}

const contextOf = (usage: unknown): number | undefined =>
  countIn(usage, "input_tokens") === undefined
    ? undefined
    : CONTEXT_PARTS.reduce((sum, part) => sum + (countIn(usage, part) ?? 0), 0)

const toolUsesIn = (content: unknown): string[] =>
  Array.isArray(content)
    ? content.flatMap((block: unknown) =>
        isRecord(block) && block["type"] === "tool_use" && typeof block["id"] === "string"
          ? [block["id"]]
          : [],
      )
    : []

const timeOf = (row: Record<PropertyKey, unknown>): number | undefined => {
  const at = typeof row["timestamp"] === "string" ? Date.parse(row["timestamp"]) : Number.NaN
  return Number.isFinite(at) ? at : undefined
}

const assistantOf = (
  row: Record<PropertyKey, unknown>,
): Record<PropertyKey, unknown> | undefined => {
  const message = row["message"]
  return isRecord(message) && message["role"] === "assistant" && message["model"] !== SYNTHETIC
    ? message
    : undefined
}

const responseOf = (
  row: Record<PropertyKey, unknown>,
  message: Record<PropertyKey, unknown>,
): unknown => row["requestId"] ?? message["id"]

const isMain = (row: unknown): row is Record<PropertyKey, unknown> =>
  isRecord(row) && row["isSidechain"] !== true

const keyOf = (row: Record<PropertyKey, unknown>): unknown => {
  const message = assistantOf(row)
  return message === undefined ? undefined : responseOf(row, message)
}

const spokenIn = (text: string): Spoken | undefined => {
  const rows = text.split("\n").map(parsed).filter(isMain)
  const first = rows[0]
  const earliest = first === undefined ? undefined : keyOf(first)
  let said: Spoken | undefined
  let response: unknown
  for (const row of rows) {
    const message = assistantOf(row)
    if (message === undefined) continue
    const same = said !== undefined && responseOf(row, message) === response
    response = responseOf(row, message)
    said = {
      model: typeof message["model"] === "string" ? message["model"] : undefined,
      context: contextOf(message["usage"]),
      output: countIn(message["usage"], "output_tokens"),
      stopReason: typeof message["stop_reason"] === "string" ? message["stop_reason"] : undefined,
      toolUses: [...(same ? (said?.toolUses ?? []) : []), ...toolUsesIn(message["content"])],
      at: timeOf(row),
      whole: earliest !== response,
    }
  }
  return said
}

const NEAR_TAIL = 16_384

const spokenAt = (transcript: string, bytes: number): Spoken | undefined => {
  const tail = tailOf(transcript, bytes)
  const spoken = tail === undefined ? undefined : spokenIn(tail.toString("utf8"))
  return spoken !== undefined && tail !== undefined && tail.length < bytes
    ? { ...spoken, whole: true }
    : spoken
}

export const lastAssistantOf = (
  transcript: unknown,
  bytes: number,
  wanted?: string,
): Spoken | undefined => {
  if (typeof transcript !== "string") return undefined
  if (bytes <= NEAR_TAIL) return spokenAt(transcript, bytes)
  const near = spokenAt(transcript, NEAR_TAIL)
  const enough =
    near !== undefined && (wanted === undefined || (near.whole && near.toolUses.includes(wanted)))
  return enough ? near : spokenAt(transcript, bytes)
}
