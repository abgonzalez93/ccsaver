import { readdirSync } from "node:fs"
import { tokensIn } from "../state/config.store.ts"
import { foldMonth, logDir, MONTH, numberAt, type Row, type Rows } from "../state/log.store.ts"
import { attempt } from "../state/state.store.ts"
import { MODEL_NAME, type Prices } from "./prices.store.ts"

export const REAL_LOW = 1.9
export const REAL_HIGH = 2.8
const MONTH_FILE = /^events-(.+)\.jsonl$/
export const PER_MILLION = 1_000_000
export const UNNAMED = "(unnamed)"

export interface Read {
  deniedTokens: number
  rangedTokens: number
}

export interface Paging {
  reads: number
  reread: number
}

export interface Spend {
  denied: number
  outside: number
  ranged: number
  uncounted: number
  byModel: Record<string, Read>
  paged: Map<string, Paging>
  deniedIn: Set<string>
  calls: number
  followedCalls: number
  paid: number
  paidUsd: number
  external: number
  externalTokens: number
  estimated: number
  answerTokens: number
}

export interface Band {
  low: number
  high: number
}

export interface Money {
  without: Band
  used: Band
  saved: Band
}

const NO_READ: Read = { deniedTokens: 0, rangedTokens: 0 }
const UNPAGED: Paging = { reads: 0, reread: 0 }

export const nothingSpent = (): Spend => ({
  denied: 0,
  outside: 0,
  ranged: 0,
  uncounted: 0,
  byModel: {},
  paged: new Map(),
  deniedIn: new Set(),
  calls: 0,
  followedCalls: 0,
  paid: 0,
  paidUsd: 0,
  external: 0,
  externalTokens: 0,
  estimated: 0,
  answerTokens: 0,
})

const partOf = (lines: number, offset: number, limit: number): number => {
  const from = Math.min(Math.max(offset - 1, 0), lines)
  const took = limit > 0 ? Math.min(limit, lines - from) : lines - from
  return Math.max(0, took) / lines
}

const modelOf = (row: Row): string => {
  const model = row["model"]
  return typeof model === "string" && MODEL_NAME.test(model) ? model : UNNAMED
}

const withRead = (
  byModel: Record<string, Read>,
  model: string,
  more: Read,
): Record<string, Read> => {
  const now = byModel[model] ?? NO_READ
  return {
    ...byModel,
    [model]: {
      deniedTokens: now.deniedTokens + more.deniedTokens,
      rangedTokens: now.rangedTokens + more.rangedTokens,
    },
  }
}

export const totalled = (byModel: Record<string, Read>): Read =>
  Object.values(byModel).reduce(
    (sum, read) => ({
      deniedTokens: sum.deniedTokens + read.deniedTokens,
      rangedTokens: sum.rangedTokens + read.rangedTokens,
    }),
    NO_READ,
  )

const pagingKey = (row: Row): string | undefined => {
  const session = row["session"]
  const path = row["path"]
  if (typeof row["agent_id"] === "string") return undefined
  return typeof session === "string" && typeof path === "string" ? `${session}\t${path}` : undefined
}

const pagedAfter = (paged: Map<string, Paging>, row: Row, denied: boolean): void => {
  const key = pagingKey(row)
  if (key === undefined) return
  const open = paged.get(key)
  if (open === undefined) {
    if (denied) paged.set(key, UNPAGED)
  } else if (!denied)
    paged.set(key, { reads: open.reads + 1, reread: open.reread + numberAt(row, "context") })
}

const gateInto = (sum: Spend, row: Row): Spend => {
  const tokens = tokensIn(numberAt(row, "bytes"))
  const model = modelOf(row)
  if (row["decision"] === "deny") {
    if (row["inside"] === false) return { ...sum, outside: sum.outside + 1 }
    pagedAfter(sum.paged, row, true)
    if (typeof row["session"] === "string") sum.deniedIn.add(row["session"])
    return {
      ...sum,
      denied: sum.denied + 1,
      byModel: withRead(sum.byModel, model, { deniedTokens: tokens, rangedTokens: 0 }),
    }
  }
  if (row["reason"] !== "range" && row["decision"] !== "rewrite") return sum
  pagedAfter(sum.paged, row, false)
  const lines = numberAt(row, "lines")
  if (lines <= 0) return { ...sum, ranged: sum.ranged + 1, uncounted: sum.uncounted + 1 }
  const part = partOf(lines, numberAt(row, "offset"), numberAt(row, "limit"))
  return {
    ...sum,
    ranged: sum.ranged + 1,
    byModel: withRead(sum.byModel, model, {
      deniedTokens: 0,
      rangedTokens: Math.round(tokens * part),
    }),
  }
}

const delegateInto = (sum: Spend, row: Row): Spend => {
  const session = row["session"]
  const followed = typeof session === "string" && sum.deniedIn.has(session) ? 1 : 0
  const called: Spend = {
    ...sum,
    calls: sum.calls + 1,
    followedCalls: sum.followedCalls + followed,
    answerTokens: sum.answerTokens + tokensIn(numberAt(row, "answerChars")),
  }
  if (row["answered"] === "fallback")
    return { ...called, paid: sum.paid + 1, paidUsd: sum.paidUsd + numberAt(row, "cost") }
  if (row["answered"] !== "external") return called
  const reported = numberAt(row, "inTokens")
  return {
    ...called,
    external: sum.external + 1,
    externalTokens: sum.externalTokens + (reported || tokensIn(numberAt(row, "chars"))),
    estimated: sum.estimated + (reported > 0 ? 0 : 1),
  }
}

const into = (sum: Spend, row: Row): Spend => {
  if (row["kind"] === "gate" && row["tool_use_id"] !== "doctor") return gateInto(sum, row)
  return row["kind"] === "delegate" ? delegateInto(sum, row) : sum
}

export const tallied = (rows: Rows, from = nothingSpent()): Spend => rows.reduce(into, from)

export interface Followed {
  files: number
  reads: number
  reread: number
}

const UNFOLLOWED: Followed = { files: 0, reads: 0, reread: 0 }

export const followedIn = (tally: Spend): Followed =>
  [...tally.paged.values()].reduce<Followed>(
    (sum, { reads, reread }) =>
      reads === 0
        ? sum
        : { files: sum.files + 1, reads: sum.reads + reads, reread: sum.reread + reread },
    UNFOLLOWED,
  )

export const monthsOf = (): string[] =>
  (attempt(() => readdirSync(logDir())) ?? [])
    .flatMap((name) => MONTH_FILE.exec(name)?.[1] ?? [])
    .filter((month) => MONTH.test(month))
    .sort()

export const tallyOver = (months: string[]): Spend =>
  months.reduce((sum, month) => foldMonth(month, sum, into), nothingSpent())

const pricedIn = (tally: Spend, prices: Prices): { read: Read; each: number }[] =>
  Object.entries(tally.byModel).flatMap(([model, read]) => {
    const each = prices.models[model]
    return each === undefined ? [] : [{ read, each }]
  })

export const moneyOf = (tally: Spend, prices: Prices): Money | undefined => {
  const priced = pricedIn(tally, prices)
  if (priced.length === 0) return undefined
  const worker = prices.worker ?? 0
  const at = (real: number, pick: (read: Read) => number): number =>
    priced.reduce((sum, { read, each }) => sum + (pick(read) * real * each) / PER_MILLION, 0)
  const armOf = (real: number): [number, number] => [
    at(real, (read) => read.deniedTokens),
    at(real, (read) => read.rangedTokens) +
      (tally.externalTokens * worker) / PER_MILLION +
      tally.paidUsd,
  ]
  const [lowWithout, lowUsed] = armOf(REAL_LOW)
  const [highWithout, highUsed] = armOf(REAL_HIGH)
  return {
    without: { low: lowWithout, high: highWithout },
    used: { low: lowUsed, high: highUsed },
    saved: { low: lowWithout - lowUsed, high: highWithout - highUsed },
  }
}
