import assert from "node:assert/strict"
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import { isRecord } from "../src/state.ts"
import { events, LAUNCHER, type Ran, run, tempDir } from "./helpers.ts"

const HOME = tempDir("twice-home")
const WORK = tempDir("twice-work")
const PROJECT = join(WORK, "project")
const LOG = join(HOME, "log")
const URL = "https://worker.invalid/v1/chat/completions"
const HAIKU_ON = "a call the worker cannot take goes to paid Claude Haiku"
const HAIKU_OFF = "a call the worker cannot take fails instead of going to paid Claude Haiku"
const OWN = "the session's own claude runs the fallback"

const ccsaver = (args: string[]): Promise<Ran> => run(LAUNCHER, args, { CCSAVER_HOME: HOME })

const configs = (): number => events(HOME).filter(({ kind }) => kind === "config").length

const jsonOf = (path: string): Record<PropertyKey, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
  assert.ok(isRecord(raw))
  return raw
}

before(() => {
  mkdirSync(PROJECT, { recursive: true })
})

after(() => {
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("log on twice says the second time that it already is, and records the switch once", async () => {
  const first = await ccsaver(["log", "on"])
  assert.deepEqual([first.code, first.stdout], [0, `log on: recording metadata only in ${LOG}\n`])
  const again = await ccsaver(["log", "on"])
  assert.deepEqual([again.code, again.stdout, again.stderr], [0, "the log is already on\n", ""])
  assert.equal(configs(), 1)
})

test("plug twice changes nothing the second time, and a new adapter says what it replaced", async () => {
  const before = configs()
  const first = await ccsaver(["plug", PROJECT])
  assert.match(first.stdout, new RegExp(`^plugged ${PROJECT} · adapter none\\nmeasured: `))
  const again = await ccsaver(["plug", PROJECT])
  assert.equal(again.code, 0)
  assert.match(
    again.stdout,
    new RegExp(`^${PROJECT} is already plugged in · adapter none\\nmeasured: `),
  )
  assert.equal(readFileSync(join(HOME, "plugged"), "utf8"), `${PROJECT}\t\n`)
  const changed = await ccsaver(["plug", PROJECT, "strict-ts"])
  assert.match(
    changed.stdout,
    new RegExp(`^plugged ${PROJECT} · adapter strict-ts \\(was none\\)\\nmeasured: `),
  )
  const same = await ccsaver(["plug", PROJECT, "strict-ts"])
  assert.match(same.stdout, /^\S+ is already plugged in · adapter strict-ts\n/)
  assert.equal(readFileSync(join(HOME, "plugged"), "utf8"), `${PROJECT}\tstrict-ts\n`)
  assert.equal(configs() - before, 2)
  assert.equal((await ccsaver(["unplug", PROJECT])).stdout, `unplugged ${PROJECT}\n`)
  const gone = await ccsaver(["unplug", PROJECT])
  assert.deepEqual([gone.code, gone.stdout], [0, `${PROJECT} is not plugged in, nothing changed\n`])
  assert.equal(configs() - before, 3)
})

test("worker set with the same url and model changes nothing, and neither does a switch already so", async () => {
  const before = configs()
  assert.equal(
    (await ccsaver(["worker", "set", URL, "cheap"])).stdout,
    `worker set to ${URL} · cheap\n`,
  )
  const same = await ccsaver(["worker", "set", URL, "cheap"])
  assert.deepEqual(
    [same.code, same.stdout, same.stderr],
    [0, `the worker is already ${URL} · cheap, nothing changed\n`, ""],
  )
  const on = await ccsaver(["fallback", "on"])
  assert.deepEqual([on.code, on.stdout], [0, `the fallback is already on: ${HAIKU_ON}\n`])
  assert.deepEqual(Object.keys(jsonOf(join(HOME, "worker.json"))), ["url", "model"])
  assert.equal((await ccsaver(["fallback", "off"])).stdout, `fallback off: ${HAIKU_OFF}\n`)
  assert.equal(
    (await ccsaver(["fallback", "off"])).stdout,
    `the fallback is already off: ${HAIKU_OFF}\n`,
  )
  assert.equal((await ccsaver(["fallback", "on"])).stdout, `fallback on: ${HAIKU_ON}\n`)
  assert.equal(jsonOf(join(HOME, "worker.json"))["fallback"], true)
  assert.equal(configs() - before, 3)
})

test("worker claude says whether the pin changed, and what it was", async () => {
  const before = configs()
  const node = process.execPath
  assert.equal(
    (await ccsaver(["worker", "claude", "auto"])).stdout,
    `the fallback binary was not pinned: ${OWN}\n`,
  )
  assert.equal(
    (await ccsaver(["worker", "claude", node])).stdout,
    `fallback binary pinned: ${node}\n`,
  )
  assert.equal(
    (await ccsaver(["worker", "claude", node])).stdout,
    `the fallback binary is already pinned: ${node}\n`,
  )
  assert.equal(
    (await ccsaver(["worker", "claude", "/bin/sh"])).stdout,
    `fallback binary pinned: /bin/sh (was ${node})\n`,
  )
  assert.equal(
    (await ccsaver(["worker", "claude", "auto"])).stdout,
    `fallback binary unpinned (was /bin/sh): ${OWN}\n`,
  )
  assert.equal(jsonOf(join(HOME, "worker.json"))["claude"], undefined)
  assert.equal(configs() - before, 3)
})

test("a price typed again is already set, and a new one says what it was", async () => {
  const before = configs()
  const price = (args: string[]): Promise<Ran> => ccsaver(["price", ...args])
  const rest = "claude-opus-5 $5/M · worker (cheap) unset"
  assert.equal((await price(["claude-opus-5", "5"])).stdout, `price claude-opus-5 $5/M · ${rest}\n`)
  const same = await price(["claude-opus-5", "5"])
  assert.deepEqual([same.code, same.stdout], [0, `claude-opus-5 is already $5/M · ${rest}\n`])
  assert.equal(
    (await price(["claude-opus-5", "6"])).stdout,
    "price claude-opus-5 $6/M (was $5/M) · claude-opus-5 $6/M · worker (cheap) unset\n",
  )
  assert.equal(
    (await price(["worker", "0"])).stdout,
    "price worker $0/M · claude-opus-5 $6/M · worker (cheap) free\n",
  )
  assert.equal(
    (await price(["worker", "0"])).stdout,
    "worker is already $0/M · claude-opus-5 $6/M · worker (cheap) free\n",
  )
  assert.equal(configs() - before, 3)
})

test("an adapter that already holds the limit is left alone, file and log", async () => {
  const before = configs()
  const place = join(HOME, "adapters", "mine.json")
  assert.equal(
    (await ccsaver(["adapter", "mine", "maxLines=400"])).stdout,
    `adapter mine written to ${place}\n`,
  )
  const stamp = statSync(place).mtimeMs
  const same = await ccsaver(["adapter", "mine", "maxLines=400"])
  assert.deepEqual(
    [same.code, same.stdout],
    [0, "adapter mine already holds maxLines=400, nothing changed\n"],
  )
  assert.equal(statSync(place).mtimeMs, stamp)
  assert.equal(
    (await ccsaver(["adapter", "mine", "maxLines=400", "maxTokens=9000"])).stdout,
    `adapter mine written to ${place}\n`,
  )
  assert.deepEqual(jsonOf(place), { maxLines: 400, maxTokens: 9000 })
  assert.equal(configs() - before, 2)
})

test("log off twice says the second time that it already is", async () => {
  const off = await ccsaver(["log", "off"])
  assert.deepEqual(
    [off.code, off.stdout],
    [0, `log off: the events so far are kept in ${LOG}.off\n`],
  )
  const again = await ccsaver(["log", "off"])
  assert.deepEqual([again.code, again.stdout, again.stderr], [0, "the log is already off\n", ""])
  assert.deepEqual([existsSync(LOG), existsSync(`${LOG}.off`)], [false, true])
})
