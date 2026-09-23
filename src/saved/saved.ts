import { readdirSync } from "node:fs"
import { tokensIn } from "../state/config.ts"
import { foldMonth, logDir, MONTH, numberAt, type Row, type Rows } from "../state/log.ts"
import { attempt } from "../state/state.ts"
import { MODEL_NAME, type Prices } from "./prices.ts"

export const REAL_LOW = 1.9
export const REAL_HIGH = 2.8
const MONTH_FILE = /^events-(.+)\.jsonl$/
export const PER_MILLION = 1_000_000
export const UNNAMED = "(unnamed)"

export interface Read {
  deniedTokens: number
  rangedTokens: number
}

export interface Spend {
  denied: number
  ranged: number
  uncounted: number
  byModel: Record<string, Read>
  calls: number
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

export const NOTHING_SPENT: Spend = {
  denied: 0,
  ranged: 0,
  uncounted: 0,
  byModel: {},
  calls: 0,
  paid: 0,
  paidUsd: 0,
  external: 0,
  externalTokens: 0,
  estimated: 0,
  answerTokens: 0,
}

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

const gateInto = (sum: Spend, row: Row): Spend => {
  const tokens = tokensIn(numberAt(row, "bytes"))
  const model = modelOf(row)
  if (row["decision"] === "deny")
    return {
      ...sum,
      denied: sum.denied + 1,
      byModel: withRead(sum.byModel, model, { deniedTokens: tokens, rangedTokens: 0 }),
    }
  if (row["reason"] !== "range") return sum
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
  const calls = sum.calls + 1
  const answerTokens = sum.answerTokens + tokensIn(numberAt(row, "answerChars"))
  if (row["answered"] === "fallback")
    return {
      ...sum,
      calls,
      answerTokens,
      paid: sum.paid + 1,
      paidUsd: sum.paidUsd + numberAt(row, "cost"),
    }
  if (row["answered"] !== "external") return { ...sum, calls, answerTokens }
  const reported = numberAt(row, "inTokens")
  return {
    ...sum,
    calls,
    answerTokens,
    external: sum.external + 1,
    externalTokens: sum.externalTokens + (reported || tokensIn(numberAt(row, "chars"))),
    estimated: sum.estimated + (reported > 0 ? 0 : 1),
  }
}

const into = (sum: Spend, row: Row): Spend => {
  if (row["kind"] === "gate" && row["tool_use_id"] !== "doctor") return gateInto(sum, row)
  return row["kind"] === "delegate" ? delegateInto(sum, row) : sum
}

export const tallied = (rows: Rows, from: Spend = NOTHING_SPENT): Spend => rows.reduce(into, from)

export const monthsOf = (): string[] =>
  (attempt(() => readdirSync(logDir())) ?? [])
    .flatMap((name) => MONTH_FILE.exec(name)?.[1] ?? [])
    .filter((month) => MONTH.test(month))
    .sort()

export const tallyOver = (months: string[]): Spend =>
  months.reduce((sum, month) => foldMonth(month, sum, into), NOTHING_SPENT)

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
