import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs"
import { join } from "node:path"
import { BYTES_PER_TOKEN, DEFAULT_LIMITS, linesIn } from "./config.store.ts"
import { record } from "./log.store.ts"
import { attempt, isRecord, parsed, Refusal, stateHome, writePrivate } from "./state.store.ts"

export interface Handoff {
  on: boolean
  limit: number
}

export const DEFAULT_HANDOFF = { on: true, limit: 200_000 } as const

const HANDOFF_KEYS = ["on", "limit"]
const MARKER_DAYS = 7
const DAY_MS = 86_400_000
const MAX_BYTES = DEFAULT_LIMITS.maxTokens * BYTES_PER_TOKEN
const UNSAFE = /[^A-Za-z0-9._-]/g

export const handoffFile = (): string => join(stateHome(), "handoff.json")

export const handoffDir = (): string => join(stateHome(), "handoff")

const malformed = (): string => `${handoffFile()} is malformed: fix it or delete it`

const isLimit = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0

export const readHandoff = (): Handoff => {
  const text = attempt(() => readFileSync(handoffFile(), "utf8"))
  if (text === undefined) {
    if (!existsSync(handoffFile())) return { ...DEFAULT_HANDOFF }
    throw new Refusal(`${handoffFile()} cannot be read: check its owner and its mode`)
  }
  const raw = parsed(text)
  if (
    !isRecord(raw) ||
    Array.isArray(raw) ||
    !Object.keys(raw).every((key) => HANDOFF_KEYS.includes(key))
  )
    throw new Refusal(malformed())
  const { on, limit } = raw
  if ((on !== undefined && typeof on !== "boolean") || (limit !== undefined && !isLimit(limit)))
    throw new Refusal(malformed())
  return { on: on ?? DEFAULT_HANDOFF.on, limit: limit ?? DEFAULT_HANDOFF.limit }
}

const storeHandoff = (handoff: Handoff): void => {
  writePrivate(handoffFile(), `${JSON.stringify(handoff, null, 2)}\n`)
}

export interface Switched {
  before: Handoff
  changed: boolean
}

export const setHandoff = (change: Partial<Handoff>): Switched => {
  const before = readHandoff()
  const after: Handoff = { ...before, ...change }
  if (after.on === before.on && after.limit === before.limit) return { before, changed: false }
  storeHandoff(after)
  record("config", { action: "handoff", ...change })
  return { before, changed: true }
}

const nameOf = (session: string): string => session.replace(UNSAFE, "-").slice(0, 200)

const markerOf = (session: string): string => join(handoffDir(), `${nameOf(session)}.tier`)

const privateDir = (): void => {
  mkdirSync(handoffDir(), { recursive: true, mode: 0o700 })
  chmodSync(handoffDir(), 0o700)
}

export const readTier = (session: string): number | undefined => {
  const text = attempt(() => readFileSync(markerOf(session), "utf8"))
  const tier = Number(text)
  return text !== undefined && Number.isInteger(tier) && tier >= 0 ? tier : undefined
}

const swept = (keep: string, now: number): void => {
  for (const name of attempt(() => readdirSync(handoffDir())) ?? []) {
    if (!name.endsWith(".tier") || name === keep) continue
    const place = join(handoffDir(), name)
    const age = now - (attempt(() => statSync(place).mtimeMs) ?? now)
    if (age > MARKER_DAYS * DAY_MS) attempt(() => unlinkSync(place))
  }
}

export const writeTier = (session: string, tier: number, now = Date.now()): void => {
  privateDir()
  writePrivate(markerOf(session), `${tier}\n`)
  swept(`${nameOf(session)}.tier`, now)
}

export interface Kept {
  place: string
  lines: number
  bytes: number
  replaced: boolean
}

const counted = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`

export const keepHandoff = (text: string, session: string | undefined): Kept => {
  if (text.trim() === "") throw new Refusal("an empty handoff, nothing was written")
  const body = text.endsWith("\n") ? text : `${text}\n`
  const bytes = Buffer.byteLength(body)
  const lines = linesIn(Buffer.from(body))
  if (lines > DEFAULT_LIMITS.maxLines || bytes > MAX_BYTES)
    throw new Refusal(
      `a handoff has to fit one whole Read, ${DEFAULT_LIMITS.maxLines} lines and ${MAX_BYTES} bytes; this one has ${counted(lines, "line")} and ${counted(bytes, "byte")}`,
    )
  const name =
    session === undefined ? new Date().toISOString().replaceAll(":", "-") : nameOf(session)
  privateDir()
  const place = join(handoffDir(), `${name}.md`)
  const replaced = existsSync(place)
  writePrivate(place, body)
  record("handoff", { action: "written", lines, bytes, replaced }, session)
  return { place, lines, bytes, replaced }
}

export const keptHandoffs = (): string[] =>
  (attempt(() => readdirSync(handoffDir())) ?? [])
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(handoffDir(), name))

const modifiedAt = (place: string): number => attempt(() => statSync(place).mtimeMs) ?? 0

export const latestHandoff = (): string | undefined =>
  keptHandoffs().sort((first, second) => modifiedAt(second) - modifiedAt(first))[0]
