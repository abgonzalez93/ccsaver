import assert from "node:assert/strict"
import { chmodSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { moneyOf, NOTHING, type Prices, seen, tallied } from "../src/roi.ts"
import { CLI, type Ran, run, tempDir } from "./helpers.ts"

const AS_ROOT = process.getuid?.() === 0
const WORK = tempDir("roi-work")

const gate = (fields: Record<string, unknown>): Record<PropertyKey, unknown> => ({
  kind: "gate",
  decision: "allow",
  ...fields,
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
  assert.deepEqual([tally.denied, tally.deniedTokens], [1, 10_000])
})

test("a ranged read counts the part of the file its offset and limit cover", () => {
  const whole = gate({ reason: "range", bytes: 40_000, lines: 900 })
  const tally = tallied([
    { ...whole, offset: 1, limit: 90 },
    { ...whole, offset: 801 },
    { ...whole },
  ])
  assert.equal(tally.ranged, 3)
  assert.equal(tally.rangedTokens, 1_000 + 1_111 + 10_000)
})

test("a read under the limit is neither denied nor counted as a range", () => {
  const tally = tallied([gate({ reason: "under", bytes: 900, lines: 20 })])
  assert.deepEqual(
    [tally.denied, tally.ranged, tally.deniedTokens, tally.rangedTokens],
    [0, 0, 0, 0],
  )
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
  const tally = { ...NOTHING, deniedTokens: 1_000_000, rangedTokens: 100_000 }
  const money = moneyOf(tally, { main: 3 })
  assert.ok(money !== undefined)
  assert.deepEqual([money.without.low.toFixed(2), money.without.high.toFixed(2)], ["5.70", "8.40"])
  const low = Math.round((100 * money.saved.low) / money.without.low)
  const high = Math.round((100 * money.saved.high) / money.without.high)
  assert.deepEqual([low, high], [90, 90])
})

test("no price for the session model means no money at all, not money at zero", () => {
  const tally = { ...NOTHING, deniedTokens: 1_000_000 }
  assert.equal(moneyOf(tally, {}), undefined)
  assert.equal(moneyOf(tally, { worker: 0.1 }), undefined)
  const priced: Prices = { main: 3 }
  assert.ok(moneyOf(tally, priced) !== undefined)
})

test("an unpriced worker costs nothing rather than stopping the sum", () => {
  const tally = { ...NOTHING, externalTokens: 1_000_000, deniedTokens: 1_000_000 }
  const free = moneyOf(tally, { main: 3 })
  const paid = moneyOf(tally, { main: 3, worker: 0.5 })
  assert.ok(free !== undefined && paid !== undefined)
  assert.equal(paid.used.low - free.used.low, 0.5)
})

test("twenty events is where it starts to judge, and under it says how many there are", async () => {
  const thin = homeWith("thin", [[denial(40_000), denial(40_000)]])
  await priced(thin, ["main", "3"])
  const out = await saved(thin)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /2 events here, and 20 is where this starts to say anything/)
  assert.doesNotMatch(out.stdout, /^ {2}without {4}\$/m)
  assert.equal(seen({ ...NOTHING, denied: 19, calls: 1 }), 20)
})

test("without a price it counts tokens and names the command that adds one", async () => {
  const home = homeWith("tokens", [twenty()])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /denied {5}20 whole-file reads, 0\.20 M tokens by bytes\/4/)
  assert.match(out.stdout, /no price is set, so this is tokens only: ccsaver price main/)
})

test("a saving that is not one prints negative, with no percentage beside it", async () => {
  const home = homeWith("negative", [
    [...twenty(), { kind: "delegate", answered: "fallback", cost: 50 }],
  ])
  await priced(home, ["main", "3"])
  const out = await saved(home)
  assert.match(out.stdout, /saved {6}-\$4[0-9.]+ - -\$4[0-9.]+ +the delegations cost more/)
  assert.doesNotMatch(out.stdout, /%/)
})

test("reads the log cannot explain are called out instead of read as a clean win", async () => {
  const home = homeWith("orphan", [twenty()])
  await priced(home, ["main", "3"])
  const out = await saved(home)
  assert.match(out.stdout, /nothing here replaced those reads/)
  assert.match(out.stdout, /the gate watches the/)
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

test("a price is a positive number, stored privately, and shown back with both sides", async () => {
  const home = homeWith("prices", [twenty()])
  const ok = await priced(home, ["main", "3"])
  assert.deepEqual([ok.code, ok.stdout], [0, "price main $3/M · main 3 · worker unset\n"])
  const both = await priced(home, ["worker", "0.1"])
  assert.equal(both.stdout, "price worker $0.1/M · main 3 · worker 0.1\n")
  for (const wrong of [
    ["main", "-3"],
    ["main", "0"],
    ["worker", "abc"],
  ]) {
    const out = await priced(home, wrong)
    assert.equal(out.code, 1)
    assert.match(out.stderr, /a price is dollars per million input tokens, a positive number/)
  }
  assert.equal(statSync(join(home, "prices.json")).mode & 0o777, 0o600)
})

test("a prices.json that cannot be read stops the command, never reads as no price", {
  skip: AS_ROOT,
}, async () => {
  const home = homeWith("unreadable", [twenty()])
  await priced(home, ["main", "3"])
  const file = join(home, "prices.json")
  chmodSync(file, 0o000)
  const out = await saved(home)
  chmodSync(file, 0o600)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /prices\.json cannot be read: check its owner and its mode/)
})

test("a malformed prices.json stops the command instead of being ignored", async () => {
  const home = homeWith("malformed", [twenty()])
  writeFileSync(join(home, "prices.json"), '{"main": "3"}')
  const out = await saved(home)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /prices\.json is malformed: fix it or delete it/)
})
