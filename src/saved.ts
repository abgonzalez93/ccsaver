import { existsSync, readdirSync, readFileSync } from "node:fs"
import { tokensIn } from "./config.ts"
import { logDir, monthKey, numberAt, type Row, type Rows, readMonth, record } from "./log.ts"
import { attempt, inColour, isRecord, parsed, pricesFile, Refusal, writePrivate } from "./state.ts"

const REAL_LOW = 1.9
const REAL_HIGH = 2.8
const MONTH_FILE = /^events-(\d{4}-\d{2})\.jsonl$/
const ENOUGH = 20
const BAR = 22
const PER_MILLION = 1_000_000
const GREEN = 32
const RED = 31
const LABEL = 11
const WIDTH = 18
const SMALL = 1

interface Spend {
  denied: number
  deniedTokens: number
  ranged: number
  rangedTokens: number
  calls: number
  paid: number
  paidUsd: number
  external: number
  externalTokens: number
  estimated: number
}

interface Band {
  low: number
  high: number
}

export interface Prices {
  main?: number
  worker?: number
}

interface Money {
  without: Band
  used: Band
  saved: Band
}

export const NOTHING_SPENT: Spend = {
  denied: 0,
  deniedTokens: 0,
  ranged: 0,
  rangedTokens: 0,
  calls: 0,
  paid: 0,
  paidUsd: 0,
  external: 0,
  externalTokens: 0,
  estimated: 0,
}

const partOf = (lines: number, offset: number, limit: number): number => {
  if (lines <= 0) return 1
  const from = Math.min(Math.max(offset - 1, 0), lines)
  const took = limit > 0 ? Math.min(limit, lines - from) : lines - from
  return Math.max(0, took) / lines
}

const gateInto = (sum: Spend, row: Row): Spend => {
  const tokens = tokensIn(numberAt(row, "bytes"))
  if (row["decision"] === "deny")
    return { ...sum, denied: sum.denied + 1, deniedTokens: sum.deniedTokens + tokens }
  if (row["reason"] !== "range") return sum
  const part = partOf(numberAt(row, "lines"), numberAt(row, "offset"), numberAt(row, "limit"))
  return {
    ...sum,
    ranged: sum.ranged + 1,
    rangedTokens: sum.rangedTokens + Math.round(tokens * part),
  }
}

const delegateInto = (sum: Spend, row: Row): Spend => {
  const calls = sum.calls + 1
  if (row["answered"] === "fallback")
    return { ...sum, calls, paid: sum.paid + 1, paidUsd: sum.paidUsd + numberAt(row, "cost") }
  if (row["answered"] !== "external") return { ...sum, calls }
  const reported = numberAt(row, "inTokens")
  return {
    ...sum,
    calls,
    external: sum.external + 1,
    externalTokens: sum.externalTokens + (reported || tokensIn(numberAt(row, "chars"))),
    estimated: sum.estimated + (reported > 0 ? 0 : 1),
  }
}

export const tallied = (rows: Rows, from: Spend = NOTHING_SPENT): Spend =>
  rows.reduce((sum, row) => {
    if (row["kind"] === "gate" && row["tool_use_id"] !== "doctor") return gateInto(sum, row)
    return row["kind"] === "delegate" ? delegateInto(sum, row) : sum
  }, from)

const monthsOf = (): string[] =>
  (attempt(() => readdirSync(logDir())) ?? [])
    .flatMap((name) => MONTH_FILE.exec(name)?.[1] ?? [])
    .sort()

const tallyOver = (months: string[]): Spend =>
  months.reduce((sum, month) => tallied(readMonth(month), sum), NOTHING_SPENT)

export const seen = (tally: Spend): number => tally.denied + tally.calls

const isPrice = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0

const readPrices = (): Prices => {
  const text = attempt(() => readFileSync(pricesFile(), "utf8"))
  if (text === undefined) {
    if (!existsSync(pricesFile())) return {}
    throw new Refusal(`${pricesFile()} cannot be read: check its owner and its mode`)
  }
  const raw = parsed(text)
  const { main, worker } = isRecord(raw) ? raw : {}
  if ((main !== undefined && !isPrice(main)) || (worker !== undefined && !isPrice(worker)))
    throw new Refusal(`${pricesFile()} is malformed: fix it or delete it`)
  return { ...(isPrice(main) ? { main } : {}), ...(isPrice(worker) ? { worker } : {}) }
}

export const writePrice = (which: "main" | "worker", usd: number): Prices => {
  const after: Prices = { ...readPrices(), [which]: usd }
  writePrivate(pricesFile(), `${JSON.stringify(after, null, 2)}\n`)
  record("config", { action: "price", which, usd })
  return after
}

export const moneyOf = (tally: Spend, prices: Prices): Money | undefined => {
  const main = prices.main
  if (main === undefined) return undefined
  const worker = prices.worker ?? 0
  const armOf = (real: number): [number, number] => [
    (tally.deniedTokens * real * main) / PER_MILLION,
    (tally.rangedTokens * real * main) / PER_MILLION +
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

const millions = (tokens: number): string => `${(tokens / PER_MILLION).toFixed(2)} M`

const many = (count: number, one: string): string => `${count} ${one}${count === 1 ? "" : "s"}`

const usd = (value: number, places: number): string =>
  `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(places)}`

const tinted = (text: string, colour: number): string =>
  inColour() ? `\u001b[${colour}m${text}\u001b[0m` : text

const barOf = (value: number, top: number): string => {
  const filled = Math.min(BAR, Math.max(0, top > 0 ? Math.round((BAR * value) / top) : 0))
  return `${"█".repeat(filled)}${"·".repeat(BAR - filled)}`
}

const rowOf = (label: string, band: string, after: string, colour?: number): string => {
  const wide = band.padEnd(WIDTH)
  return `  ${label.padEnd(LABEL)}${colour === undefined ? wide : tinted(wide, colour)} ${after}`
}

const percentOf = (saved: number, without: number): number =>
  without > 0 ? Math.round((100 * saved) / without) : 0

const countedIn = (tally: Spend): string[] => [
  `  ${"denied".padEnd(LABEL)}${many(tally.denied, "whole-file read")}, ${millions(tally.deniedTokens)} tokens by bytes/4`,
  `  ${"instead".padEnd(LABEL)}${many(tally.ranged, "ranged read")} while plugged, ${millions(tally.rangedTokens)} tokens`,
  `  ${"delegated".padEnd(LABEL)}${many(tally.calls, "call")} · ${tally.external} external (${millions(tally.externalTokens)} tokens) · ${tally.paid} paid Haiku (${usd(tally.paidUsd, 4)})`,
]

const savedIn = (money: Money, places: number): string => {
  const band = `${usd(money.saved.low, places)} - ${usd(money.saved.high, places)}`
  if (money.saved.high < 0)
    return rowOf("saved", band, "the delegations cost more than the reads they replaced", RED)
  if (money.saved.low < 0)
    return rowOf(
      "saved",
      band,
      "the band crosses zero: this month may have cost more than it saved",
    )
  const low = percentOf(money.saved.low, money.without.low)
  const high = percentOf(money.saved.high, money.without.high)
  return rowOf("saved", band, `${low} % - ${high} %`, GREEN)
}

const moneyIn = (money: Money): string[] => {
  const places = money.without.high < SMALL ? 4 : 2
  const band = (one: Band): string => `${usd(one.low, places)} - ${usd(one.high, places)}`
  const top = Math.max(money.without.high, money.used.high)
  return [
    rowOf("without", band(money.without), barOf(money.without.high, top)),
    rowOf("with", band(money.used), barOf(money.used.high, top)),
    savedIn(money, places),
  ]
}

const thinIn = (tally: Spend): string[] =>
  seen(tally) < ENOUGH
    ? [
        `  ${many(tally.denied, "denied read")} and ${many(tally.calls, "delegation")}, and ${ENOUGH} of the two is where this starts to say anything`,
      ]
    : ["  no price is set, so this is tokens only: ccsaver price main <usd per million>"]

const pricedIn = (prices: Prices): string[] =>
  prices.worker === undefined
    ? [
        `  at $${prices.main}/M for the session model; the worker's own tokens are not priced yet (ccsaver price worker <usd>)`,
      ]
    : [`  at $${prices.main}/M for the session model and $${prices.worker}/M for the worker`]

const orphaned = (tally: Spend): boolean =>
  tally.denied > 0 && tally.ranged === 0 && tally.calls === 0

const footnotes = (tally: Spend, prices: Prices, priced: boolean): string[] => [
  ...(priced ? pricedIn(prices) : []),
  `  a real Read measured ${REAL_LOW}-${REAL_HIGH}x the bytes/4 estimate, and that band is the whole spread here`,
  ...(tally.estimated > 0
    ? [
        `  ${tally.estimated} of ${tally.external} external calls reported no usage and were counted at chars/4`,
      ]
    : []),
  ...(priced && orphaned(tally)
    ? ["  nothing here replaced those reads, so `without` is the most flattering reading there is"]
    : []),
  "  a denial is not a saving on its own: read `instead` beside it, which counts every ranged",
  "  read in a plugged project and not only the ones a denial caused; the gate watches the Read",
  "  tool only, so a Grep or a cat that replaced one is in neither column",
]

const spanOf = (months: string[]): string => {
  const first = months[0]
  const last = months.at(-1)
  if (first === undefined || last === undefined) return "no month recorded yet"
  return first === last ? first : `${first} … ${last}`
}

export const report = (given: string | undefined): string => {
  if (!existsSync(logDir()))
    return "the log is off, so there is nothing to add up: ccsaver log on\n"
  const months = given === "all" ? monthsOf() : [given ?? monthKey()]
  const tally = tallyOver(months)
  const prices = readPrices()
  const money = seen(tally) < ENOUGH ? undefined : moneyOf(tally, prices)
  const lines = [
    `ccsaver saved · ${spanOf(months)}`,
    "",
    ...countedIn(tally),
    "",
    ...(money === undefined ? thinIn(tally) : moneyIn(money)),
    "",
    ...footnotes(tally, prices, money !== undefined),
  ]
  return `${lines.join("\n")}\n`
}
