import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs"
import { join } from "node:path"
import { attempt, isRecord, parsed, Refusal, stateHome, storedKey } from "./state.ts"

export type Rows = Record<PropertyKey, unknown>[]

const LOG_VERSION = 1
const LOG_LINE_BYTES = 4000
const SCRUB_FROM = 8

export const logDir = (): string => join(stateHome(), "log")

export const monthKey = (now = new Date()): string => now.toISOString().slice(0, 7)

export const logFile = (now = new Date()): string => join(logDir(), `events-${monthKey(now)}.jsonl`)

export const record = (kind: string, fields: Record<string, unknown>, session?: unknown): void => {
  try {
    const now = new Date()
    const head = {
      v: LOG_VERSION,
      ts: now.toISOString(),
      kind,
      session:
        typeof session === "string" ? session : process.env["CLAUDE_CODE_SESSION_ID"] || null,
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

const rowsIn = (text: string): Rows =>
  text.split("\n").flatMap((line) => {
    const row = parsed(line)
    return isRecord(row) ? [row] : []
  })

export const readEvents = (): Rows => rowsIn(attempt(() => readFileSync(logFile(), "utf8")) ?? "")

export const readMonth = (month: string): Rows =>
  rowsIn(attempt(() => readFileSync(join(logDir(), `events-${month}.jsonl`), "utf8")) ?? "")

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

export const setLog = (on: boolean): void => {
  const dir = logDir()
  const aside = `${dir}.off`
  if (on) {
    if (!existsSync(dir) && existsSync(aside)) renameSync(aside, dir)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    chmodSync(dir, 0o700)
  } else if (existsSync(dir) && existsSync(aside))
    throw new Refusal(`${aside} already exists: move it away, then run ccsaver log off again`)
  record("config", { action: "log", on })
  if (!on && existsSync(dir)) renameSync(dir, aside)
}
