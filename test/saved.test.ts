import assert from "node:assert/strict"
import { test } from "node:test"
import { foldMonth } from "../src/log.ts"
import type { Prices } from "../src/prices.ts"
import { moneyOf, NOTHING_SPENT, tallied, totalled } from "../src/saved.ts"
import { denialRow, gateRow } from "./helpers.ts"

const OPUS = "claude-opus-5"
const FABLE = "claude-fable-5-1"

const spent = (models: Record<string, [number, number]>): typeof NOTHING_SPENT => ({
  ...NOTHING_SPENT,
  byModel: Object.fromEntries(
    Object.entries(models).map(([model, [deniedTokens, rangedTokens]]) => [
      model,
      { deniedTokens, rangedTokens },
    ]),
  ),
})

test("doctor's own probe is left out of the reads it counts", () => {
  const tally = tallied([
    denialRow(40_000),
    { ...denialRow(999_999), tool_use_id: "doctor" },
    { kind: "note", text: "ignored" },
  ])
  assert.deepEqual([tally.denied, totalled(tally.byModel).deniedTokens], [1, 10_000])
})

test("a ranged read counts the part of the file its offset and limit cover", () => {
  const whole = gateRow({ reason: "range", bytes: 40_000, lines: 900 })
  const tally = tallied([
    { ...whole, offset: 1, limit: 90 },
    { ...whole, offset: 801 },
    { ...whole },
  ])
  assert.equal(tally.ranged, 3)
  assert.equal(totalled(tally.byModel).rangedTokens, 1_000 + 1_111 + 10_000)
})

test("a read under the limit is neither denied nor counted as a range", () => {
  const tally = tallied([gateRow({ reason: "under", bytes: 900, lines: 20 })])
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

test("each model is priced at its own rate, not at one rate for the month", () => {
  const tally = spent({ [OPUS]: [1_000_000, 0], [FABLE]: [1_000_000, 0] })
  const both = moneyOf(tally, { models: { [OPUS]: 5, [FABLE]: 10 } })
  const one = moneyOf(spent({ [OPUS]: [2_000_000, 0] }), { models: { [OPUS]: 5 } })
  assert.ok(both !== undefined && one !== undefined)
  assert.equal(both.without.low.toFixed(4), ((1 * 5 + 1 * 10) * 1.9).toFixed(4))
  assert.notEqual(both.without.low.toFixed(4), one.without.low.toFixed(4))
})

test("a month is YYYY-MM, so no reader of the log can be steered out of its folder", () => {
  for (const wrong of ["2026-13", "../../etc/passwd", "2026-01/../../.ssh/id_rsa"])
    assert.throws(() => foldMonth(wrong, 0, (sum) => sum), /a month is YYYY-MM, this one is not/)
})
