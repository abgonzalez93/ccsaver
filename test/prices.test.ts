import assert from "node:assert/strict"
import { chmodSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { CLI, logHome, type Ran, run, tempDir, twentyDenials, writeHome } from "./helpers.ts"

const AS_ROOT = process.getuid?.() === 0
const OPUS = "claude-opus-5"
const WORK = tempDir("prices-work")

const homeWith = (label: string, rows: Record<PropertyKey, unknown>[][]): string =>
  logHome(WORK, label, rows)

const saved = (home: string, args: string[] = []): Promise<Ran> =>
  run("node", [CLI, "saved", ...args], { CCSAVER_HOME: home })

const priced = (home: string, args: string[]): Promise<Ran> =>
  run("node", [CLI, "price", ...args], { CCSAVER_HOME: home })

const twenty = twentyDenials

after(() => {
  rmSync(WORK, { recursive: true, force: true })
})

test("price with nothing after it lists what is set, one to a line", async () => {
  const home = homeWith("listed", [twenty()])
  const empty = await priced(home, [])
  assert.deepEqual(
    [empty.code, empty.stdout],
    [0, "no model has a price yet: ccsaver price <model> <usd per million>\n  worker   unset\n"],
  )
  await priced(home, [OPUS, "5"])
  await priced(home, ["worker", "0"])
  const full = await priced(home, [])
  assert.equal(full.code, 0)
  assert.equal(full.stdout, `  ${OPUS.padEnd(16)}$5/M\n  ${"worker".padEnd(16)}free\n`)
  writeHome(home, { worker: { url: "https://h/v1/chat/completions", model: "gemma-3" } })
  const named = await priced(home, [])
  assert.equal(named.stdout, `  ${OPUS.padEnd(19)}$5/M\n  ${"worker (gemma-3)".padEnd(19)}free\n`)
})

test("a worker that costs nothing is set down as free, not left looking unanswered", async () => {
  const home = homeWith("free-worker", [
    [...twenty(), { kind: "delegate", answered: "external", chars: 4_000_000 }],
  ])
  await priced(home, [OPUS, "5"])
  const nagged = await saved(home)
  assert.match(nagged.stdout, /the worker has no price for its own tokens yet/)
  const set = await priced(home, ["worker", "0"])
  assert.equal(set.stdout, `price worker $0/M · ${OPUS} $5/M · worker free\n`)
  const out = await saved(home)
  assert.match(out.stdout, /at \$5\/M for claude-opus-5, and the worker is free/)
  assert.doesNotMatch(out.stdout, /no price for its own tokens/)
  writeHome(home, { worker: { url: "https://h/v1/chat/completions", model: "gemma-3" } })
  const named = await saved(home)
  assert.match(named.stdout, /and the worker \(gemma-3\) is free/)
  const wrong = await priced(home, [OPUS, "0"])
  assert.equal(wrong.code, 1)
  assert.match(wrong.stderr, /0 only for a worker that is free/)
})

test("a price is a positive number, stored privately, and shown back with both sides", async () => {
  const home = homeWith("prices", [twenty()])
  const ok = await priced(home, [OPUS, "3"])
  assert.deepEqual([ok.code, ok.stdout], [0, `price ${OPUS} $3/M · ${OPUS} $3/M · worker unset\n`])
  const both = await priced(home, ["worker", "0.1"])
  assert.equal(both.stdout, `price worker $0.1/M · ${OPUS} $3/M · worker $0.1/M\n`)
  for (const wrong of [
    [OPUS, "-3"],
    [OPUS, "0"],
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
  await priced(home, [OPUS, "3"])
  const file = join(home, "prices.json")
  chmodSync(file, 0o000)
  const out = await saved(home)
  chmodSync(file, 0o600)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /prices\.json cannot be read: check its owner and its mode/)
})

test("a malformed prices.json stops the command instead of being ignored", async () => {
  const home = homeWith("malformed", [twenty()])
  writeFileSync(join(home, "prices.json"), '{"models": {"claude-opus-5": "3"}}')
  const out = await saved(home)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /prices\.json is malformed: every model needs a name and a price/)
})

test("the old single main price is refused, never read as the rate for every model", async () => {
  const home = homeWith("legacy", [twenty()])
  writeFileSync(join(home, "prices.json"), '{"main": 3}')
  const out = await saved(home)
  assert.equal(out.code, 1)
  assert.match(out.stderr, /carries one main price for every model/)
  assert.match(out.stderr, /ccsaver price <model> <usd>/)
})

test("a prices.json that is not an object stops the command, never reads as no price", async () => {
  const home = homeWith("shapeless", [twentyDenials()])
  await priced(home, [OPUS, "3"])
  const file = join(home, "prices.json")
  const kept = readFileSync(file, "utf8")
  const misspelt = '{"models": {"claude-opus-5": 3}, "modles": {"claude-opus-5": 9}}'
  for (const broken of ["[]", "5", '"hi"', "null", '{"models": {"claude-opus-5": 3}', misspelt]) {
    writeFileSync(file, broken)
    const out = await saved(home)
    assert.deepEqual([out.code, out.stdout], [1, ""], broken)
    assert.match(out.stderr, /prices\.json is malformed/, broken)
    const price = await priced(home, [OPUS, "4"])
    assert.equal(price.code, 1, broken)
    assert.equal(readFileSync(file, "utf8"), broken, broken)
  }
  writeFileSync(file, kept)
  assert.equal((await saved(home)).code, 0)
})
