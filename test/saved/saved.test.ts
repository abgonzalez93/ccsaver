import assert from "node:assert/strict"
import { test } from "node:test"
import type { Prices } from "../../src/saved/prices.store.ts"
import {
  moneyOf,
  nothingSpent,
  type Spend,
  tallied,
  totalled,
} from "../../src/saved/saved.service.ts"
import { foldMonth } from "../../src/state/log.store.ts"
import { denialRow, gateRow } from "../test.helpers.ts"

const OPUS = "claude-opus-5"
const FABLE = "claude-fable-5-1"

const spent = (models: Record<string, [number, number]>): Spend => ({
  ...nothingSpent(),
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
    { ...denialRow(999_999), kind: "doctor", tool_use_id: "doctor" },
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

test("a read rewritten into its first lines counts as the ranged read it became, never as a denial", () => {
  const cut = {
    decision: "rewrite",
    reason: "lines",
    bytes: 40_000,
    lines: 900,
    offset: 1,
    limit: 90,
  }
  const tally = tallied([gateRow(cut)])
  assert.deepEqual(
    [tally.denied, tally.ranged, totalled(tally.byModel).rangedTokens],
    [0, 1, 1_000],
  )
})

test("a ranged read of a file whose lines the hook never counted is not counted as the whole file", () => {
  const big = gateRow({ reason: "range", bytes: 200_000, lines: null, offset: 1, limit: 100 })
  const tally = tallied([
    big,
    big,
    gateRow({ reason: "range", bytes: 4_000, lines: 100, limit: 50 }),
  ])
  assert.deepEqual(
    [tally.ranged, tally.uncounted, totalled(tally.byModel).rangedTokens],
    [3, 2, 500],
  )
})

test("a PDF read by pages is a ranged read the log cannot weigh, so it is counted and left out", () => {
  const tally = tallied([
    gateRow({ reason: "range", bytes: 4_000, lines: 100, pages: "1-2" }),
    gateRow({ reason: "range", bytes: 4_000, lines: 100, pages: 3 }),
  ])
  assert.deepEqual([tally.ranged, tally.uncounted, totalled(tally.byModel).rangedTokens], [2, 2, 0])
})

test("a model id written the Bedrock or the Vertex way is a model of its own, never unnamed", () => {
  const bedrock = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
  const vertex = "claude-sonnet-4-5@20250929"
  const tally = tallied([
    { ...denialRow(40_000), model: bedrock },
    { ...denialRow(40_000), model: vertex },
  ])
  assert.deepEqual(Object.keys(tally.byModel).sort(), [vertex, bedrock].sort())
})

test("a read under the limit is neither denied nor counted as a range", () => {
  const tally = tallied([gateRow({ reason: "under", bytes: 900, lines: 20 })])
  assert.deepEqual([tally.denied, tally.ranged, totalled(tally.byModel).deniedTokens], [0, 0, 0])
})

test("a denial that ranged reads of the same file follow in the same session keeps them, with the context they carried", () => {
  const first = { session: "s1", path: "a.ts" }
  const range = { reason: "range", bytes: 40_000, lines: 1000, limit: 100 }
  const tally = tallied([
    { ...denialRow(40_000), ...first, context: 100_000 },
    gateRow({ ...range, ...first, offset: 1, context: 110_000 }),
    gateRow({ ...range, ...first, offset: 101, context: 120_000 }),
    gateRow({ ...range, session: "s2", path: "a.ts", offset: 1, context: 5 }),
    { ...denialRow(40_000), session: "s1", path: "b.ts", context: 100_000 },
    gateRow({ ...range, session: "s1", path: "c.ts", offset: 1, context: 5 }),
    { ...denialRow(40_000), path: "d.ts" },
  ])
  assert.deepEqual(
    tally.paged,
    new Map([
      ["s1\ta.ts", { reads: 2, reread: 230_000 }],
      ["s1\tb.ts", { reads: 0, reread: 0 }],
    ]),
  )
  assert.deepEqual([tally.denied, tally.ranged], [3, 4])
})

test("a file denied twice in one session is one entry, and the second denial does not reset what followed the first", () => {
  const same = { session: "s1", path: "pnpm-lock.yaml" }
  const range = gateRow({
    ...same,
    reason: "range",
    bytes: 400_000,
    lines: null,
    offset: 1,
    limit: 100,
    context: 50_000,
  })
  const tally = tallied([
    { ...denialRow(400_000), ...same, context: 100_000 },
    range,
    { ...denialRow(400_000), ...same, context: 100_000 },
    range,
  ])
  assert.deepEqual(tally.paged, new Map([["s1\tpnpm-lock.yaml", { reads: 2, reread: 100_000 }]]))
  assert.deepEqual([tally.denied, tally.ranged, tally.uncounted], [2, 2, 2])
})

test("a subagent's reads take no part in what followed a denial, because the log holds no context for them", () => {
  const same = { session: "s1", path: "a.ts" }
  const range = { ...same, reason: "range", bytes: 40_000, lines: 1000, offset: 1, limit: 100 }
  const tally = tallied([
    { ...denialRow(40_000), ...same, context: 100_000 },
    gateRow({ ...range, agent_id: "agent-7", context: null }),
    gateRow({ ...range, context: 110_000 }),
    { ...denialRow(40_000), session: "s1", path: "b.ts", agent_id: "agent-7", context: null },
    gateRow({ ...range, path: "b.ts", context: 120_000 }),
  ])
  assert.deepEqual(tally.paged, new Map([["s1\ta.ts", { reads: 1, reread: 110_000 }]]))
  assert.deepEqual([tally.denied, tally.ranged], [2, 3])
})

test("a call after a denial in the same session is counted as what the denial asked for; one before it, in another session, or after a denial outside the root is not", () => {
  const tally = tallied([
    { kind: "delegate", session: "s1", answered: "external", chars: 4_000 },
    { ...denialRow(40_000), session: "s1", path: "a.ts" },
    { kind: "delegate", session: "s1", answered: "external", chars: 4_000 },
    { kind: "delegate", session: "s1", fell: "no key" },
    { kind: "delegate", session: "s2", answered: "fallback", cost: 0.01 },
    { ...denialRow(40_000), session: "s3", inside: false },
    { kind: "delegate", session: "s3", answered: "external", chars: 4_000 },
    { kind: "delegate", answered: "external", chars: 4_000 },
  ])
  assert.deepEqual([tally.calls, tally.followedCalls, tally.deniedIn], [6, 2, new Set(["s1"])])
})

test("nothing spent is a fresh tally each time, so one month's paging never leaks into the next", () => {
  const same = { session: "s1", path: "a.ts" }
  tallied([{ ...denialRow(40_000), ...same }])
  assert.equal(nothingSpent().paged.size, 0)
  assert.equal(tallied([]).paged.size, 0)
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

test("a denial of a file outside the plugged root is counted apart, never as a saving", () => {
  const spend = tallied([denialRow(40_000), { ...denialRow(40_000), inside: false }])
  assert.deepEqual([spend.denied, spend.outside], [1, 1])
})

test("a ranged read of a file outside the plugged root is left out of instead, as its denial is", () => {
  const range = { reason: "range", bytes: 400_000, lines: 10_000, offset: 1, limit: 100 }
  const spend = tallied([
    gateRow({ ...range, inside: false }),
    gateRow({ ...range, inside: true, path: "a.ts", bytes: 40_000, lines: 1_000 }),
  ])
  assert.deepEqual([spend.ranged, totalled(spend.byModel).rangedTokens], [1, 1_000])
})
