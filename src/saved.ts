import { existsSync, readdirSync } from "node:fs"
import { tokensIn } from "./config.ts"
import { logDir, MONTH, monthKey, numberAt, type Row, type Rows, readMonth } from "./log.ts"
import { MODEL_NAME, type Prices, readPrices, workerNamed } from "./prices.ts"
import { attempt, inColour } from "./state.ts"

const REAL_LOW = 1.9
const REAL_HIGH = 2.8
const DENIAL_TOKENS = 94
const MONTH_FILE = /^events-(.+)\.jsonl$/
const BAR = 22
const PER_MILLION = 1_000_000
const GREEN = 32
const RED = 31
const LABEL = 11
const WIDTH = 18
const SMALL = 1
const UNNAMED = "(unnamed)"

interface Read {
  deniedTokens: number
  rangedTokens: number
}

interface Spend {
  denied: number
  ranged: number
  byModel: Record<string, Read>
  calls: number
  paid: number
  paidUsd: number
  external: number
  externalTokens: number
  estimated: number
  answerTokens: number
}

interface Band {
  low: number
  high: number
}

interface Money {
  without: Band
  used: Band
  saved: Band
}

const NO_READ: Read = { deniedTokens: 0, rangedTokens: 0 }

export const NOTHING_SPENT: Spend = {
  denied: 0,
  ranged: 0,
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
  if (lines <= 0) return 1
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
  const part = partOf(numberAt(row, "lines"), numberAt(row, "offset"), numberAt(row, "limit"))
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

export const tallied = (rows: Rows, from: Spend = NOTHING_SPENT): Spend =>
  rows.reduce((sum, row) => {
    if (row["kind"] === "gate" && row["tool_use_id"] !== "doctor") return gateInto(sum, row)
    return row["kind"] === "delegate" ? delegateInto(sum, row) : sum
  }, from)

const monthsOf = (): string[] =>
  (attempt(() => readdirSync(logDir())) ?? [])
    .flatMap((name) => MONTH_FILE.exec(name)?.[1] ?? [])
    .filter((month) => MONTH.test(month))
    .sort()

const tallyOver = (months: string[]): Spend =>
  months.reduce((sum, month) => tallied(readMonth(month), sum), NOTHING_SPENT)

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
  `  ${"denied".padEnd(LABEL)}${many(tally.denied, "whole-file read")}, ${millions(totalled(tally.byModel).deniedTokens)} tokens by bytes/4`,
  `  ${"instead".padEnd(LABEL)}${many(tally.ranged, "ranged read")} while plugged, ${millions(totalled(tally.byModel).rangedTokens)} tokens`,
  `  ${"delegated".padEnd(LABEL)}${many(tally.calls, "call")} · ${tally.external} external (${millions(tally.externalTokens)} tokens) · ${tally.paid} paid Haiku (${usd(tally.paidUsd, 4)})`,
]

const savedIn = (money: Money, places: number): string => {
  const worst = Math.min(money.saved.low, money.saved.high)
  const best = Math.max(money.saved.low, money.saved.high)
  const band = `${usd(worst, places)} - ${usd(best, places)}`
  if (best < 0)
    return rowOf("saved", band, "the delegations cost more than the reads they replaced", RED)
  if (worst < 0)
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

const unpricedIn = (tally: Spend, prices: Prices): string[] =>
  Object.entries(tally.byModel)
    .filter(([model]) => prices.models[model] === undefined)
    .flatMap(([model, read]) =>
      model === UNNAMED
        ? [`  ${millions(read.deniedTokens)} denied tokens are under no model the log names`]
        : [
            `  ${model} denied ${millions(read.deniedTokens)} tokens here and has no price, so it is left out:`,
            `  ccsaver price ${model} <usd per million>`,
          ],
    )

const bodyOf = (tally: Spend, prices: Prices, money: Money | undefined): string[] => {
  const unpriced = unpricedIn(tally, prices)
  if (money === undefined)
    return unpriced.length === 0
      ? ["  nothing was denied and nothing was read by ranges here, so there is nothing to compare"]
      : ["  no model here has a price, so this is tokens only:", ...unpriced]
  if (money.without.high === 0)
    return [
      "  no denied read here carries a price, so there is no without side to draw",
      ...unpriced,
    ]
  return [...moneyIn(money), ...unpriced]
}

const rateIn = (tally: Spend, prices: Prices): string => {
  const named = Object.keys(tally.byModel)
    .flatMap((model) => {
      const each = prices.models[model]
      return each === undefined ? [] : [`$${each}/M for ${model}`]
    })
    .join(", ")
  const worker = workerNamed()
  if (prices.worker === undefined)
    return `  at ${named}; the ${worker} has no price for its own tokens yet (ccsaver price worker <usd>)`
  return prices.worker === 0
    ? `  at ${named}, and the ${worker} is free`
    : `  at ${named} and $${prices.worker}/M for the ${worker}`
}

const orphaned = (tally: Spend): boolean =>
  tally.denied > 0 && tally.ranged === 0 && tally.calls === 0

const readBack = (tally: Spend): number => tally.denied * DENIAL_TOKENS + tally.answerTokens

const footnotes = (tally: Spend, prices: Prices, priced: boolean): string[] => [
  ...(priced ? [rateIn(tally, prices)] : []),
  `  a real Read measured ${REAL_LOW}-${REAL_HIGH}x the bytes/4 estimate, and that band is the whole spread here`,
  ...(readBack(tally) > 0
    ? [
        `  neither column holds what the session read back because of ccsaver: ${millions(readBack(tally))} tokens`,
        `  of denial messages (~${DENIAL_TOKENS} each) and worker answers, all of it against ccsaver`,
      ]
    : []),
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
  const money = moneyOf(tally, prices)
  const lines = [
    `ccsaver saved · ${spanOf(months)}`,
    "",
    ...countedIn(tally),
    "",
    ...bodyOf(tally, prices, money),
    "",
    ...footnotes(tally, prices, money !== undefined),
  ]
  return `${lines.join("\n")}\n`
}
