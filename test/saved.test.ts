import assert from "node:assert/strict"
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { readMonth } from "../src/log.ts"
import type { Prices } from "../src/prices.ts"
import { moneyOf, NOTHING_SPENT, tallied, totalled } from "../src/saved.ts"
import { CLI, type Ran, run, tempDir } from "./helpers.ts"

const AS_ROOT = process.getuid?.() === 0
const WORK = tempDir("saved-work")

const OPUS = "claude-opus-5"
const FABLE = "claude-fable-5-1"

const gate = (fields: Record<string, unknown>): Record<PropertyKey, unknown> => ({
  kind: "gate",
  decision: "allow",
  model: OPUS,
  ...fields,
})

const spent = (models: Record<string, [number, number]>): typeof NOTHING_SPENT => ({
  ...NOTHING_SPENT,
  byModel: Object.fromEntries(
    Object.entries(models).map(([model, [deniedTokens, rangedTokens]]) => [
      model,
      { deniedTokens, rangedTokens },
    ]),
  ),
})

const denial = (bytes: number): Record<PropertyKey, unknown> =>
  gate({ decision: "deny", reason: "lines", bytes, lines: Math.round(bytes / 40) })

const monthBack = (back: number): string => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    .toISOString()
    .slice(0, 7)
}

const homeWith = (label: string, rows: Record<PropertyKey, unknown>[][]): string => {
  const home = join(WORK, label)
  mkdirSync(join(home, "log"), { recursive: true, mode: 0o700 })
  for (const [at, month] of rows.entries())
    writeFileSync(
      join(home, "log", `events-${monthBack(at)}.jsonl`),
      month.map((row) => `${JSON.stringify({ v: 1, ...row })}\n`).join(""),
      { mode: 0o600 },
    )
  return home
}

const saved = (home: string, args: string[] = []): Promise<Ran> =>
  run("node", [CLI, "saved", ...args], { CCSAVER_HOME: home })

const priced = (home: string, args: string[]): Promise<Ran> =>
  run("node", [CLI, "price", ...args], { CCSAVER_HOME: home })

const twenty = (): Record<PropertyKey, unknown>[] =>
  Array.from({ length: 20 }, () => denial(40_000))

after(() => {
  rmSync(WORK, { recursive: true, force: true })
})

test("doctor's own probe is left out of the reads it counts", () => {
  const tally = tallied([
    denial(40_000),
    { ...denial(999_999), tool_use_id: "doctor" },
    { kind: "note", text: "ignored" },
  ])
  assert.deepEqual([tally.denied, totalled(tally.byModel).deniedTokens], [1, 10_000])
})

test("a ranged read counts the part of the file its offset and limit cover", () => {
  const whole = gate({ reason: "range", bytes: 40_000, lines: 900 })
  const tally = tallied([
    { ...whole, offset: 1, limit: 90 },
    { ...whole, offset: 801 },
    { ...whole },
  ])
  assert.equal(tally.ranged, 3)
  assert.equal(totalled(tally.byModel).rangedTokens, 1_000 + 1_111 + 10_000)
})

test("a read under the limit is neither denied nor counted as a range", () => {
  const tally = tallied([gate({ reason: "under", bytes: 900, lines: 20 })])
  assert.deepEqual([tally.denied, tally.ranged, totalled(tally.byModel).deniedTokens], [0, 0, 0])
})

test("an external call that reports its usage is counted from that, not from chars/4", () => {
  const tally = tallied([
    { kind: "delegate", answered: "external", chars: 40_000 },
    { kind: "delegate", answered: "external", chars: 40_000, inTokens: 12_500 },
    { kind: "delegate", answered: "fallback", cost: 0.0128 },
    { kind: "delegate", fell: "no key" },
  ])
  assert.equal(tally.externalTokens, 10_000 + 12_500)
  assert.deepEqual([tally.calls, tally.external, tally.estimated], [4, 2, 1])
  assert.deepEqual([tally.paid, tally.paidUsd], [1, 0.0128])
})

test("the band pairs low with low, so the percentage barely moves while the dollars swing", () => {
  const tally = spent({ [OPUS]: [1_000_000, 100_000] })
  const money = moneyOf(tally, { models: { [OPUS]: 3 } })
  assert.ok(money !== undefined)
  assert.deepEqual([money.without.low.toFixed(2), money.without.high.toFixed(2)], ["5.70", "8.40"])
  const low = Math.round((100 * money.saved.low) / money.without.low)
  const high = Math.round((100 * money.saved.high) / money.without.high)
  assert.deepEqual([low, high], [90, 90])
})

test("no price for the session model means no money at all, not money at zero", () => {
  const tally = spent({ [OPUS]: [1_000_000, 0] })
  assert.equal(moneyOf(tally, { models: {} }), undefined)
  assert.equal(moneyOf(tally, { models: {}, worker: 0.1 }), undefined)
  assert.equal(moneyOf(tally, { models: { [FABLE]: 10 } }), undefined)
  const priced: Prices = { models: { [OPUS]: 3 } }
  assert.ok(moneyOf(tally, priced) !== undefined)
})

test("an unpriced worker costs nothing rather than stopping the sum", () => {
  const tally = { ...spent({ [OPUS]: [1_000_000, 0] }), externalTokens: 1_000_000 }
  const free = moneyOf(tally, { models: { [OPUS]: 3 } })
  const paid = moneyOf(tally, { models: { [OPUS]: 3 }, worker: 0.5 })
  assert.ok(free !== undefined && paid !== undefined)
  assert.equal(paid.used.low - free.used.low, 0.5)
})

test("a thin month draws the bars all the same, with the two counts over them", async () => {
  const thin = homeWith("thin", [
    [denial(40_000), denial(40_000), { kind: "delegate", answered: "external", chars: 4_000 }],
  ])
  await priced(thin, [OPUS, "3"])
  const out = await saved(thin)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /^ {2}denied {5}2 whole-file reads/m)
  assert.match(out.stdout, /^ {2}delegated {2}1 call/m)
  assert.match(out.stdout, /^ {2}without {4}\$/m)
  assert.match(out.stdout, /^ {2}saved {6}.+ % - \d+ %$/m)
  assert.doesNotMatch(out.stdout, /where this starts to say anything/)
})

test("a month with nothing to compare says so where the bars would be", async () => {
  const home = homeWith("nothing", [[gate({ reason: "under", bytes: 100 })]])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /nothing was denied and nothing was read by ranges here/)
  assert.doesNotMatch(out.stdout, /^ {2}without {4}\$/m)
})

test("without a price it counts tokens and names the command that adds one", async () => {
  const home = homeWith("tokens", [twenty()])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /denied {5}20 whole-file reads, 0\.20 M tokens by bytes\/4/)
  assert.match(out.stdout, /no model here has a price, so this is tokens only:/)
  assert.match(
    out.stdout,
    new RegExp(
      `${OPUS} denied 0\\.20 M tokens here and has no price[\\s\\S]*ccsaver price ${OPUS}`,
    ),
  )
})

test("a saving that is not one prints negative, with no percentage beside it", async () => {
  const home = homeWith("negative", [
    [...twenty(), { kind: "delegate", answered: "fallback", cost: 50 }],
  ])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  assert.match(out.stdout, /saved {6}-\$4[0-9.]+ - -\$4[0-9.]+ +the delegations cost more/)
  assert.doesNotMatch(out.stdout, /%/)
})

test("a month whose denials carry no price draws no bars, and says which side is missing", async () => {
  const home = homeWith("no-without", [
    [
      { ...denial(40_000), model: "" },
      ...Array.from({ length: 5 }, () =>
        gate({ reason: "range", bytes: 40_000, lines: 1_000, offset: 1, limit: 1_000 }),
      ),
    ],
  ])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(
    out.stdout,
    /no denied read here carries a price, so there is no without side to draw/,
  )
  assert.match(out.stdout, /denied tokens are under no model the log names/)
  assert.doesNotMatch(out.stdout, /^ {2}without {4}\$/m)
})

test("the report paints itself, so a worker model is escaped before it is painted", async () => {
  const home = homeWith("painted", [[denial(40_000)]])
  await priced(home, [OPUS, "3"])
  writeFileSync(
    join(home, "worker.json"),
    JSON.stringify({ url: "https://h/v1/chat/completions", model: "gemma\u001b[2J" }),
    { mode: 0o600 },
  )
  await priced(home, ["worker", "0"])
  const out = await saved(home)
  assert.match(out.stdout, /the worker \(gemma\\x1b\[2J\) is free/)
  assert.equal(out.stdout.includes("\u001b"), false)
})

test("a band reads low to high even when both of its arms are a loss", async () => {
  const home = homeWith("backwards", [
    [
      denial(4_000),
      ...Array.from({ length: 20 }, () =>
        gate({ reason: "range", bytes: 400_000, lines: 10_000, offset: 1, limit: 10_000 }),
      ),
    ],
  ])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  const line = out.stdout.split("\n").find((row) => row.startsWith("  saved")) ?? ""
  assert.match(line, /^ {2}saved {6}-\$16\.79\d+ - -\$11\.39\d+ +the delegations cost more/)
})

test("a band that crosses zero is painted as neither a saving nor a loss", async () => {
  const home = homeWith("crossing", [
    [
      ...Array.from({ length: 15 }, () => denial(400_000)),
      ...Array.from({ length: 15 }, () =>
        gate({ reason: "range", bytes: 355_555, lines: 9_000, offset: 1, limit: 9_000 }),
      ),
      ...Array.from({ length: 10 }, () => ({ kind: "delegate", answered: "fallback", cost: 0.12 })),
    ],
  ])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  const line = out.stdout.split("\n").find((row) => row.startsWith("  saved")) ?? ""
  assert.match(line, /^ {2}saved {6}-\$0\.25 - \$0\.20 +the band crosses zero/)
  assert.deepEqual([line.includes("%"), line.includes("\u001b")], [false, false])
})

test("reads the log cannot explain are called out instead of read as a clean win", async () => {
  const home = homeWith("orphan", [twenty()])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  assert.match(out.stdout, /nothing here replaced those reads/)
  assert.match(out.stdout, /the gate watches the/)
})

test("each model is priced at its own rate, not at one rate for the month", () => {
  const tally = spent({ [OPUS]: [1_000_000, 0], [FABLE]: [1_000_000, 0] })
  const both = moneyOf(tally, { models: { [OPUS]: 5, [FABLE]: 10 } })
  const one = moneyOf(spent({ [OPUS]: [2_000_000, 0] }), { models: { [OPUS]: 5 } })
  assert.ok(both !== undefined && one !== undefined)
  assert.equal(both.without.low.toFixed(4), ((1 * 5 + 1 * 10) * 1.9).toFixed(4))
  assert.notEqual(both.without.low.toFixed(4), one.without.low.toFixed(4))
})

test("a model with no price is named with the command that gives it one, never guessed", async () => {
  const home = homeWith("two-models", [
    [
      ...Array.from({ length: 20 }, () => denial(40_000)),
      ...Array.from({ length: 4 }, () => ({ ...denial(400_000), model: FABLE })),
    ],
  ])
  await priced(home, [OPUS, "5"])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(out.stdout, new RegExp(`at \\$5/M for ${OPUS}`))
  assert.match(
    out.stdout,
    new RegExp(
      `${FABLE} denied 0\\.40 M tokens here and has no price, so it is left out:\\n {2}ccsaver price ${FABLE} <usd per million>`,
    ),
  )
  assert.doesNotMatch(out.stdout, new RegExp(`\\$[0-9.]+/M for ${FABLE}`))
})

test("a gate line the hook could not name a model for is counted apart, never folded in", async () => {
  const home = homeWith("unnamed", [
    Array.from({ length: 20 }, () => ({ ...denial(40_000), model: null })),
  ])
  await priced(home, [OPUS, "5"])
  const out = await saved(home)
  assert.match(out.stdout, /0\.20 M denied tokens are under no model the log names/)
  assert.doesNotMatch(out.stdout, /^ {2}without/m)
})

test("all sums every month in the log, and a month names only that one", async () => {
  const home = homeWith("months", [twenty(), twenty()])
  const [both, one, missing] = await Promise.all([
    saved(home, ["all"]),
    saved(home, [monthBack(1)]),
    saved(home, ["2020-07"]),
  ])
  assert.equal(both.stdout.split("\n")[0], `ccsaver saved · ${monthBack(1)} … ${monthBack(0)}`)
  assert.match(both.stdout, /denied {5}40 whole-file reads/)
  assert.equal(one.stdout.split("\n")[0], `ccsaver saved · ${monthBack(1)}`)
  assert.match(one.stdout, /denied {5}20 whole-file reads/)
  assert.match(missing.stdout, /denied {5}0 whole-file reads/)
})

test("a month that is not a month gets the usage line of its own command", async () => {
  const home = homeWith("bad-month", [twenty()])
  const out = await saved(home, ["2026-13"])
  assert.equal(out.code, 1)
  assert.match(out.stderr, /^usage: ccsaver <command>\n\n {2}saved \[month\|all\]/)
  assert.equal(out.stdout, "")
})

test("the log being off is not a failure", async () => {
  const out = await saved(join(WORK, "never-logged"))
  assert.deepEqual(
    [out.code, out.stdout],
    [0, "the log is off, so there is nothing to add up: ccsaver log on\n"],
  )
})

test("a month that cannot be read stops the report, never counts as no events", {
  skip: AS_ROOT,
}, async () => {
  const home = homeWith("unreadable-log", [twenty()])
  const file = join(home, "log", `events-${monthBack(0)}.jsonl`)
  chmodSync(file, 0o000)
  const out = await saved(home)
  chmodSync(file, 0o600)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /events-\d{4}-\d{2}\.jsonl cannot be read: check its owner/)
  assert.equal(out.stdout, "")
})

test("a month is YYYY-MM, so no reader of the log can be steered out of its folder", () => {
  for (const wrong of ["2026-13", "../../etc/passwd", "2026-01/../../.ssh/id_rsa"])
    assert.throws(() => readMonth(wrong), /a month is YYYY-MM, this one is not/)
})
