import { existsSync } from "node:fs"
import { tinted } from "../cli/terminal.reporter.ts"
import { logDir, monthKey } from "../state/log.store.ts"
import { plural } from "../state/state.store.ts"
import { type Prices, readPrices, workerNamed } from "./prices.store.ts"
import {
  type Band,
  followedIn,
  type Money,
  moneyOf,
  monthsOf,
  PER_MILLION,
  REAL_HIGH,
  REAL_LOW,
  type Read,
  type Spend,
  tallyOver,
  totalled,
  UNNAMED,
} from "./saved.service.ts"

const DENIAL_TOKENS = 64
const BAR = 22
const GREEN = 32
const RED = 31
const LABEL = 11
const WIDTH = 18
const SMALL = 1
const SMALL_COUNT = 10_000

const millions = (tokens: number): string =>
  tokens < SMALL_COUNT ? `${tokens}` : `${(tokens / PER_MILLION).toFixed(2)} M`

const usd = (value: number, places: number): string =>
  `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(places)}`

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
  `  ${"denied".padEnd(LABEL)}${plural(tally.denied, "whole-file read")}, ${millions(totalled(tally.byModel).deniedTokens)} tokens by bytes/4`,
  `  ${"instead".padEnd(LABEL)}${plural(tally.ranged, "ranged read")} while plugged, ${millions(totalled(tally.byModel).rangedTokens)} tokens`,
  `  ${"delegated".padEnd(LABEL)}${plural(tally.calls, "call")} · ${tally.external} external (${millions(tally.externalTokens)} tokens) · ${tally.paid} paid Haiku (${usd(tally.paidUsd, 4)})`,
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

const unpricedLines = (model: string, read: Read): string[] => {
  const whose = model === UNNAMED ? "the model the log does not name" : model
  if (read.deniedTokens === 0)
    return [
      `  nothing was denied under ${whose}, so its ${millions(read.rangedTokens)} ranged tokens are left out as well`,
    ]
  if (model === UNNAMED)
    return [`  ${millions(read.deniedTokens)} denied tokens are under no model the log names`]
  return [
    `  ${model} denied ${millions(read.deniedTokens)} tokens here and has no price, so it is left out:`,
    `  ccsaver price ${model} <usd per million>`,
  ]
}

const unpricedIn = (tally: Spend, prices: Prices): string[] =>
  Object.entries(tally.byModel)
    .filter(([model]) => prices.models[model] === undefined)
    .flatMap(([model, read]) => unpricedLines(model, read))

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

const followedLines = (tally: Spend): string[] => {
  const followed = followedIn(tally)
  if (followed.files === 0) return []
  const counted =
    followed.reread > 0
      ? `${millions(followed.reread)} tokens by the log`
      : "which the log did not count"
  return [
    `  ${followed.files} of ${plural(tally.paged.size, "denied file")} ${followed.files === 1 ? "was" : "were"} read by ranges after the denial, in the same session:`,
    `  ${plural(followed.reads, "read")}, each a request that re-read the whole context, ${counted}, in neither column`,
  ]
}

const followedCallsLine = (tally: Spend): string[] =>
  tally.denied > 0 && tally.calls > 0
    ? [
        `  ${tally.followedCalls} of ${plural(tally.calls, "call")} followed a denial in the same session, which is what the denial asks for; the log does not say which file they took`,
      ]
    : []

const footnotes = (tally: Spend, prices: Prices, priced: boolean): string[] => [
  ...(priced ? [rateIn(tally, prices)] : []),
  `  a real Read measured ${REAL_LOW}-${REAL_HIGH}x the bytes/4 estimate, and that band is the whole spread here`,
  ...(readBack(tally) > 0
    ? [
        `  neither column holds what the session read back because of ccsaver: ${millions(readBack(tally))} tokens`,
        `  of denial messages (~${DENIAL_TOKENS} each) and worker answers, all of it against ccsaver`,
      ]
    : []),
  ...followedLines(tally),
  ...followedCallsLine(tally),
  ...(tally.estimated > 0
    ? [
        `  ${tally.estimated} of ${tally.external} external calls reported no usage and were counted at chars/4`,
      ]
    : []),
  ...(tally.uncounted > 0
    ? [
        `  ${tally.uncounted} of ${tally.ranged} ranged reads were on files past the byte limit, whose lines the hook`,
        "  never counts, or were PDF pages: the log cannot say what share of the file each covered, so",
        "  their tokens are left out of `instead`, which flatters ccsaver",
      ]
    : []),
  ...(tally.outside > 0
    ? [
        `  ${plural(tally.outside, "denied read")} of files outside the plugged project left out, because nothing could have delegated them`,
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
