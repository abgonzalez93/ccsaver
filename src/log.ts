import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs"
import { join } from "node:path"
import { attempt, isRecord, parsed, Refusal, stateHome, storedKey } from "./state.ts"

export type Row = Record<PropertyKey, unknown>

export type Rows = Row[]

export const numberAt = (row: Row, key: string): number => {
  const value = row[key]
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

const LOG_VERSION = 1
const LOG_LINE_BYTES = 4000
const SCRUB_FROM = 8
const SESSION_CHARS = 200
export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const logDir = (): string => join(stateHome(), "log")

export const monthKey = (now = new Date()): string => now.toISOString().slice(0, 7)

export const logFile = (now = new Date()): string => join(logDir(), `events-${monthKey(now)}.jsonl`)

const sessionOf = (given: unknown): string | null => {
  const text = typeof given === "string" ? given : process.env["CLAUDE_CODE_SESSION_ID"] || null
  return text === null ? null : text.slice(0, SESSION_CHARS)
}

export const record = (kind: string, fields: Record<string, unknown>, session?: unknown): void => {
  try {
    const now = new Date()
    const head = {
      v: LOG_VERSION,
      ts: now.toISOString(),
      kind,
      session: sessionOf(session),
      pid: process.pid,
    }
    const full = JSON.stringify({ ...head, ...fields })
    const size = Buffer.byteLength(full)
    const line = size > LOG_LINE_BYTES ? JSON.stringify({ ...head, dropped: size }) : full
    const stored = storedKey()
    const known = stored !== undefined && stored.length >= SCRUB_FROM ? stored : undefined
    const clean =
      known === undefined ? line : line.replaceAll(JSON.stringify(known).slice(1, -1), "[key]")
    appendFileSync(logFile(now), `${clean}\n`, { mode: 0o600 })
  } catch {
    // the folder is the switch: without it the append fails and nothing else changes
  }
}

const textAt = (place: string): string => {
  const text = attempt(() => readFileSync(place, "utf8"))
  if (text === undefined && existsSync(place))
    throw new Refusal(`${place} cannot be read: check its owner, its mode and its size`)
  return text ?? ""
}

const folded = <T>(text: string, seed: T, step: (sum: T, row: Row) => T): T => {
  let sum = seed
  for (let at = 0; at <= text.length; ) {
    const end = text.indexOf("\n", at)
    const row = parsed(text.slice(at, end === -1 ? undefined : end))
    if (isRecord(row)) sum = step(sum, row)
    if (end === -1) break
    at = end + 1
  }
  return sum
}

export const readEvents = (): Rows =>
  folded(textAt(logFile()), [], (rows: Rows, row) => {
    rows.push(row)
    return rows
  })

export const foldMonth = <T>(month: string, seed: T, step: (sum: T, row: Row) => T): T => {
  if (!MONTH.test(month)) throw new Refusal(`a month is YYYY-MM, this one is not: ${month}`)
  return folded(textAt(join(logDir(), `events-${month}.jsonl`)), seed, step)
}

export const crashed = (where: string, error: unknown): void => {
  record(
    "crash",
    error instanceof Error
      ? {
          where,
          name: error.name,
          message: error.message,
          stack: (error.stack ?? "").split("\n").slice(1, 6),
        }
      : { where, message: String(error) },
  )
}

export const setLog = (on: boolean): boolean => {
  const dir = logDir()
  const aside = `${dir}.off`
  if (on === existsSync(dir)) return false
  if (on) {
    if (existsSync(aside)) renameSync(aside, dir)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    chmodSync(dir, 0o700)
  } else if (existsSync(aside))
    throw new Refusal(`${aside} already exists: move it away, then run ccsaver log off again`)
  record("config", { action: "log", on })
  if (!on) renameSync(dir, aside)
  return true
}
