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
}

const SYNTHETIC = "<synthetic>"
const CONTEXT_PARTS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]

const contextOf = (usage: unknown): number | undefined => {
  if (!isRecord(usage) || typeof usage["input_tokens"] !== "number") return undefined
  return CONTEXT_PARTS.reduce((sum, part) => {
    const held = usage[part]
    return sum + (typeof held === "number" ? held : 0)
  }, 0)
}

const spokenIn = (text: string): Spoken | undefined => {
  let said: Spoken | undefined
  for (const line of text.split("\n")) {
    const row = parsed(line)
    if (!isRecord(row) || row["isSidechain"] === true) continue
    const message = row["message"]
    if (!isRecord(message) || message["role"] !== "assistant") continue
    const model = message["model"]
    if (model === SYNTHETIC) continue
    said = {
      model: typeof model === "string" ? model : undefined,
      context: contextOf(message["usage"]),
    }
  }
  return said
}

const NEAR_TAIL = 16_384

const spokenAt = (transcript: string, bytes: number): Spoken | undefined => {
  const tail = tailOf(transcript, bytes)
  return tail === undefined ? undefined : spokenIn(tail.toString("utf8"))
}

export const lastAssistantOf = (transcript: unknown, bytes: number): Spoken | undefined => {
  if (typeof transcript !== "string") return undefined
  if (bytes <= NEAR_TAIL) return spokenAt(transcript, bytes)
  return spokenAt(transcript, NEAR_TAIL) ?? spokenAt(transcript, bytes)
}
