import { closeSync, openSync, readSync } from "node:fs"
import { attempt } from "../state/state.store.ts"

export interface Limits {
  maxLines: number
  maxTokens: number
}

export const DEFAULT_LIMITS = { maxLines: 350, maxTokens: 8000 } as const

export const BYTES_PER_TOKEN = 4

export const SCAN_CEILING = 1_000_000

export type Reason =
  | "under"
  | "lines"
  | "tokens"
  | "range"
  | "outside"
  | "binary"
  | "unreadable"
  | "malformed"
  | "untakeable"

export const NEVER_DENIED: Reason[] = ["range", "outside", "binary", "unreadable", "malformed"]

const LINE_BREAK = 10
const NUL = 0

export const HEAD_BYTES = 8192

export const tokensIn = (bytes: number): number => Math.round(bytes / BYTES_PER_TOKEN)

export const isBinary = (bytes: Buffer): boolean => bytes.includes(NUL)

export const headOf = (path: string): Buffer | undefined => {
  const fd = attempt(() => openSync(path, "r"))
  if (fd === undefined) return undefined
  const head = Buffer.alloc(HEAD_BYTES)
  const read = attempt(() => readSync(fd, head, 0, HEAD_BYTES, 0))
  attempt(() => closeSync(fd))
  return read === undefined ? undefined : head.subarray(0, read)
}

export const linesIn = (bytes: Buffer): number => {
  let lines = bytes.length > 0 && bytes.at(-1) !== LINE_BREAK ? 1 : 0
  for (let at = bytes.indexOf(LINE_BREAK); at !== -1; at = bytes.indexOf(LINE_BREAK, at + 1))
    lines += 1
  return lines
}
