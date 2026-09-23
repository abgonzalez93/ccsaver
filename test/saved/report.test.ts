import assert from "node:assert/strict"
import { chmodSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import {
  AS_ROOT,
  CLI,
  denialRow,
  gateRow,
  logHome,
  monthBack,
  type Ran,
  run,
  tempDir,
  twentyDenials,
} from "../test.helpers.ts"

const WORK = tempDir("report-work")

const OPUS = "claude-opus-5"
const FABLE = "claude-fable-5-1"

const homeWith = (label: string, rows: Record<PropertyKey, unknown>[][]): string =>
  logHome(WORK, label, rows)

const saved = (home: string, args: string[] = []): Promise<Ran> =>
  run("node", [CLI, "saved", ...args], { CCSAVER_HOME: home })

const priced = (home: string, args: string[]): Promise<Ran> =>
  run("node", [CLI, "price", ...args], { CCSAVER_HOME: home })

after(() => {
  rmSync(WORK, { recursive: true, force: true })
})

test("a thin month draws the bars all the same, with the two counts over them", async () => {
  const thin = homeWith("thin", [
    [
      denialRow(40_000),
      denialRow(40_000),
      { kind: "delegate", answered: "external", chars: 4_000 },
    ],
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
  const home = homeWith("nothing", [[gateRow({ reason: "under", bytes: 100 })]])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /nothing was denied and nothing was read by ranges here/)
  assert.doesNotMatch(out.stdout, /^ {2}without {4}\$/m)
})

test("without a price it counts tokens and names the command that adds one", async () => {
  const home = homeWith("tokens", [twentyDenials()])
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
    [...twentyDenials(), { kind: "delegate", answered: "fallback", cost: 50 }],
  ])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  assert.match(out.stdout, /saved {6}-\$4[0-9.]+ - -\$4[0-9.]+ +the delegations cost more/)
  assert.doesNotMatch(out.stdout, /%/)
})

test("a month whose denials carry no price draws no bars, and says which side is missing", async () => {
  const home = homeWith("no-without", [
    [
      { ...denialRow(40_000), model: "" },
      ...Array.from({ length: 5 }, () =>
        gateRow({ reason: "range", bytes: 40_000, lines: 1_000, offset: 1, limit: 1_000 }),
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
  const home = homeWith("painted", [[denialRow(40_000)]])
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
      denialRow(4_000),
      ...Array.from({ length: 20 }, () =>
        gateRow({ reason: "range", bytes: 400_000, lines: 10_000, offset: 1, limit: 10_000 }),
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
      ...Array.from({ length: 15 }, () => denialRow(400_000)),
      ...Array.from({ length: 15 }, () =>
        gateRow({ reason: "range", bytes: 355_555, lines: 9_000, offset: 1, limit: 9_000 }),
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
  const home = homeWith("orphan", [twentyDenials()])
  await priced(home, [OPUS, "3"])
  const out = await saved(home)
  assert.match(out.stdout, /nothing here replaced those reads/)
  assert.match(out.stdout, /the gate watches the/)
})

test("a model with no price is named with the command that gives it one, never guessed", async () => {
  const home = homeWith("two-models", [
    [
      ...Array.from({ length: 20 }, () => denialRow(40_000)),
      ...Array.from({ length: 4 }, () => ({ ...denialRow(400_000), model: FABLE })),
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
    Array.from({ length: 20 }, () => ({ ...denialRow(40_000), model: null })),
  ])
  await priced(home, [OPUS, "5"])
  const out = await saved(home)
  assert.match(out.stdout, /0\.20 M denied tokens are under no model the log names/)
  assert.doesNotMatch(out.stdout, /^ {2}without/m)
})

test("all sums every month in the log, and a month names only that one", async () => {
  const home = homeWith("months", [twentyDenials(), twentyDenials()])
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

test("a month that is not a month is named back, over the usage line of its own command", async () => {
  const home = homeWith("bad-month", [twentyDenials()])
  const out = await saved(home, ["2026-13"])
  assert.equal(out.code, 1)
  assert.match(
    out.stderr,
    /^Error: saved takes a month, YYYY-MM, or all; not: 2026-13\nusage: ccsaver saved \[month\|all\]/,
  )
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
  const home = homeWith("unreadable-log", [twentyDenials()])
  const file = join(home, "log", `events-${monthBack(0)}.jsonl`)
  chmodSync(file, 0o000)
  const out = await saved(home)
  chmodSync(file, 0o600)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /events-\d{4}-\d{2}\.jsonl cannot be read: check its owner/)
  assert.equal(out.stdout, "")
})

test("the tokens the session read back because of ccsaver are counted, and left out", async () => {
  const home = homeWith("read-back", [
    [
      ...twentyDenials(),
      { kind: "delegate", answered: "external", chars: 40_000, answerChars: 400_000 },
      { kind: "delegate", answered: "fallback", chars: 1_000, answerChars: 4_000, cost: 0.01 },
    ],
  ])
  await priced(home, [OPUS, "5"])
  await priced(home, ["worker", "0"])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(
    out.stdout,
    /neither column holds what the session read back because of ccsaver: 0\.10 M tokens\n {2}of denial messages \(~94 each\) and worker answers, all of it against ccsaver/,
  )
  const quiet = await saved(homeWith("read-back-quiet", [[]]))
  assert.equal(quiet.stdout.includes("read back because of ccsaver"), false)
})

test("a file in the log folder that is no month is skipped, never read as one", async () => {
  const home = homeWith("stray", [twentyDenials()])
  for (const name of ["events-2026-13.jsonl", "events-.jsonl", "events-2026-1.jsonl", "notes.txt"])
    writeFileSync(join(home, "log", name), '{"v":1,"kind":"gate"}\n', { mode: 0o600 })
  const out = await saved(home, ["all"])
  assert.deepEqual([out.code, out.stderr], [0, ""])
  assert.match(out.stdout, /^ccsaver saved · \d{4}-\d{2}$/m)
  assert.match(out.stdout, /20 whole-file reads/)
})

test("a model that denied nothing is not asked for a price that would change nothing", async () => {
  const home = homeWith("ranged-only", [
    [
      ...twentyDenials(),
      {
        ...gateRow({ reason: "range", bytes: 40_000, lines: 1_000, offset: 1, limit: 100 }),
        model: FABLE,
      },
    ],
  ])
  await priced(home, [OPUS, "5"])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(
    out.stdout,
    new RegExp(
      `nothing was denied under ${FABLE}, so its 0\\.00 M ranged tokens are left out as well`,
    ),
  )
  assert.doesNotMatch(out.stdout, new RegExp(`${FABLE} denied`))
  assert.doesNotMatch(out.stdout, new RegExp(`ccsaver price ${FABLE}`))
})

test("a denied read of a file outside the plugged project is left out, and the foot says so", async () => {
  const home = homeWith("outside", [[...twentyDenials(), { ...denialRow(40_000), inside: false }]])
  await priced(home, [OPUS, "5"])
  const out = await saved(home)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /^ {2}denied {5}20 whole-file reads/m)
  assert.match(
    out.stdout,
    /1 denied read of files outside the plugged project left out, because nothing could have delegated them/,
  )
})
