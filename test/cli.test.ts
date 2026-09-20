import assert from "node:assert/strict"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import { isRecord } from "../src/state.ts"
import {
  type FakeServer,
  fakeClaude,
  LAUNCHER,
  type Ran,
  REPO,
  run,
  startServer,
  tempDir,
} from "./helpers.ts"

const HOME = tempDir("cli-home")
const WORK = tempDir("cli-work")
const PROJECT = join(WORK, "project")
const GONE = join(WORK, "gone")
const FAKE = fakeClaude(WORK)
const KEY = "k-cli-0123456789-0123456789-012345"

let server: FakeServer

const ccsaver = (args: string[], input = "", env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run(LAUNCHER, args, { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env }, input)

const everything = (out: Ran): string => `${out.stdout}${out.stderr}`

const jsonOf = (path: string): Record<PropertyKey, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
  assert.ok(isRecord(raw))
  return raw
}

before(async () => {
  server = await startServer()
  for (const dir of [PROJECT, GONE]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(HOME, "api-key"), `${KEY}\n`, { mode: 0o600 })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("plug with no directory plugs the one the command runs in", async () => {
  const home = tempDir("cli-here")
  const out = await run(LAUNCHER, ["plug"], { CCSAVER_HOME: home }, "", PROJECT)
  assert.equal(out.code, 0)
  assert.match(out.stdout, new RegExp(`^plugged ${PROJECT} · adapter none\\nmeasured: `))
  assert.equal(readFileSync(join(home, "plugged"), "utf8"), `${PROJECT}\t\n`)
  rmSync(home, { recursive: true, force: true })
})

test("plug, list and unplug from the command line", async () => {
  assert.equal((await ccsaver(["plug", PROJECT, "strict-ts"])).code, 0)
  assert.equal((await ccsaver(["plug", GONE])).code, 0)
  assert.equal((await ccsaver(["list"])).stdout, `${PROJECT}\tstrict-ts\n${GONE}\t\n`)
  assert.equal((await ccsaver(["unplug", GONE])).stdout, `unplugged ${GONE}\n`)
  assert.equal(
    (await ccsaver(["unplug", GONE])).stdout,
    `${GONE} is not plugged in, nothing changed\n`,
  )
  assert.equal((await ccsaver(["unplug"])).code, 1)
  const empty = await run(LAUNCHER, ["unplug", ""], { CCSAVER_HOME: HOME }, "", PROJECT)
  assert.deepEqual([empty.code, empty.stdout], [1, ""])
  assert.equal((await ccsaver(["list"])).stdout, `${PROJECT}\tstrict-ts\n`)
  assert.equal((await ccsaver(["plug", GONE])).code, 0)
  const refused = await ccsaver(["plug", "/"])
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /^Error: refusing to plug \/: /)
  assert.equal((await ccsaver(["frobnicate"])).code, 1)
  assert.equal((await ccsaver([])).code, 0)
})

test("adapter writes the limits, merges into an existing adapter and refuses junk", async () => {
  const home = tempDir("cli-adapter")
  const ccs = (args: string[]): Promise<Ran> => run(LAUNCHER, args, { CCSAVER_HOME: home })
  const adapters = join(home, "adapters")
  mkdirSync(adapters, { recursive: true, mode: 0o755 })
  chmodSync(adapters, 0o755)
  assert.equal((await ccs(["adapter", "fresh", "maxLines=400"])).code, 0)
  assert.equal(statSync(adapters).mode & 0o777, 0o700)
  assert.deepEqual(jsonOf(join(home, "adapters", "fresh.json")), { maxLines: 400 })
  assert.equal((await ccs(["adapter", "fresh", "maxTokens=12000"])).code, 0)
  assert.deepEqual(jsonOf(join(home, "adapters", "fresh.json")), {
    maxLines: 400,
    maxTokens: 12000,
  })
  assert.equal((await ccs(["adapter", "strict-ts", "maxLines=500"])).code, 0)
  const merged = jsonOf(join(home, "adapters", "strict-ts.json"))
  assert.deepEqual([merged["maxLines"], typeof merged["rules"]], [500, "string"])
  assert.equal(statSync(join(home, "adapters", "strict-ts.json")).mode & 0o777, 0o600)
  for (const junk of [
    ["maxLines=abc"],
    ["bogus=3"],
    ["maxLines=0"],
    ["maxLines=400=oops"],
    ["maxTokens=1000001"],
  ]) {
    const out = await ccs(["adapter", "fresh", ...junk])
    const where = junk.join(" ")
    assert.deepEqual([out.code, out.stdout], [1, ""], where)
    assert.match(
      out.stderr,
      /^Error: maxLines=<n> and maxTokens=<n>, n a positive integer up to 1000000; not: /,
      where,
    )
    assert.ok(out.stderr.trimEnd().endsWith(where), where)
    assert.equal(out.stderr.includes("usage:"), false, where)
  }
  const nothing = await ccs(["adapter", "fresh"])
  assert.deepEqual([nothing.code, nothing.stdout], [1, ""])
  assert.equal(
    nothing.stderr,
    "Error: ccsaver adapter <name> needs maxLines=<n> or maxTokens=<n>\n",
  )
  const badName = await ccs(["adapter", "Bad Name", "maxLines=400"])
  assert.equal(badName.code, 1)
  assert.match(badName.stderr, /lowercase letters, digits and dashes; not: Bad Name\n$/)
  const broken = join(home, "adapters", "broken.json")
  writeFileSync(broken, '{"rules": "mine",}')
  const kept = await ccs(["adapter", "broken", "maxLines=400"])
  assert.equal(kept.code, 1)
  assert.match(kept.stderr, /Error: adapter broken is malformed/)
  assert.equal(readFileSync(broken, "utf8"), '{"rules": "mine",}')
  rmSync(home, { recursive: true, force: true })
})

test("a control character in an argument is escaped before it reaches the terminal", async () => {
  const home = tempDir("cli-scrub")
  const bare = (args: string[]): Promise<Ran> => run(LAUNCHER, args, { CCSAVER_HOME: home })
  const wipe = "\u001b[2J"
  const gone = await bare(["unplug", `missing${wipe}`])
  assert.deepEqual(
    [gone.code, gone.stdout],
    [0, "missing\\x1b[2J is not plugged in, nothing changed\n"],
  )
  const named = await bare(["adapter", `bad${wipe}`, "maxLines=400"])
  assert.deepEqual(
    [named.code, named.stderr],
    [1, "Error: an adapter name takes lowercase letters, digits and dashes; not: bad\\x1b[2J\n"],
  )
  const unknown = await bare([`nope${wipe}`])
  assert.match(unknown.stderr, /^Error: unknown command: nope\\x1b\[2J\n/)
  const sideways = await bare(["fallback", `side${wipe}`])
  assert.match(sideways.stderr, /^Error: fallback takes on or off, not: side\\x1b\[2J\n/)
  const home_ = await run(LAUNCHER, ["list"], { CCSAVER_HOME: `relative${wipe}` }, "", WORK)
  for (const out of [gone, named, unknown, sideways, home_])
    assert.equal(`${out.stdout}${out.stderr}`.includes("\u001b"), false)
  rmSync(home, { recursive: true, force: true })
})

test("version is the package's, by either spelling", async () => {
  const { version } = jsonOf(join(REPO, "package.json"))
  assert.equal((await ccsaver(["version"])).stdout, `${String(version)}\n`)
  assert.equal((await ccsaver(["--version"])).stdout, `${String(version)}\n`)
  assert.equal(existsSync(join(HOME, "prices.json")), false)
})

test("a key in the worker url never reaches the terminal, and one in userinfo is refused", async () => {
  const keyed = `${server.url}?key=QUERY_SENTINEL`
  const set = await ccsaver(["worker", "set", keyed, "cheap-1"])
  assert.equal(set.code, 0)
  assert.equal(set.stdout, `worker set to ${server.url} · cheap-1\n`)
  assert.equal(everything(set).includes("QUERY_SENTINEL"), false)
  const seen = await ccsaver(["doctor"])
  assert.equal(everything(seen).includes("QUERY_SENTINEL"), false)
  assert.match(
    seen.stdout,
    /^ok {3}worker: http:\/\/127\.0\.0\.1:\d+\/v1\/chat\/completions · cheap-1$/m,
  )
  assert.equal(jsonOf(join(HOME, "worker.json"))["url"], keyed)
  assert.ok(server.seen.at(-1)?.body.includes("cheap-1"))
  const inside = await ccsaver(["worker", "set", "https://me:token@example.invalid/v1", "cheap-1"])
  assert.deepEqual([inside.code, inside.stdout], [1, ""])
  assert.match(inside.stderr, /^Error: the worker url must carry no user name or password/)
  const plain = await ccsaver(["worker", "set", "http://plain.invalid/v1?key=QUERY_SENTINEL", "m"])
  assert.deepEqual([plain.code, plain.stdout], [1, ""])
  assert.match(plain.stderr, /must be https \(localhost excepted\), this one is http:\n$/)
  assert.equal(everything(plain).includes("QUERY_SENTINEL"), false)
  const junk = await ccsaver(["worker", "set", "not-a-url", "m"])
  assert.match(junk.stderr, /this one is not a url\n$/)
  await ccsaver(["worker", "set", server.url, "cheap-1"])
})
test("the settings that live in worker.json all name the command that creates it", async () => {
  const home = tempDir("cli-no-worker")
  for (const args of [
    ["fallback", "on"],
    ["fallback", "off"],
    ["worker", "claude", "auto"],
  ]) {
    const out = await run(LAUNCHER, args, { CCSAVER_HOME: home })
    const where = args.join(" ")
    assert.deepEqual([out.code, out.stdout], [1, ""], where)
    assert.match(out.stderr, /, run: ccsaver worker set <url> <model>\n$/, where)
  }
  assert.equal(existsSync(join(home, "worker.json")), false)
  rmSync(home, { recursive: true, force: true })
})

test("worker claude pins the fallback binary, and auto gives it back to the session", async () => {
  const file = join(HOME, "worker.json")
  assert.equal(
    (await ccsaver(["worker", "claude", FAKE])).stdout,
    `fallback binary pinned: ${FAKE}\n`,
  )
  assert.equal(jsonOf(file)["claude"], FAKE)
  const missing = await ccsaver(["worker", "claude", join(WORK, "no-such-bin")])
  assert.equal(missing.code, 1)
  assert.match(missing.stderr, /^Error: not a file: /)
  assert.equal(jsonOf(file)["claude"], FAKE)
  const auto = await ccsaver(["worker", "claude", "auto"])
  assert.equal(
    auto.stdout,
    `fallback binary unpinned (was ${FAKE}): the session's own claude runs the fallback\n`,
  )
  assert.deepEqual(Object.keys(jsonOf(file)), ["url", "model"])
})

test("moving the worker to another host warns that the stored key stays", async () => {
  const moved = await ccsaver(["worker", "set", "https://other.invalid/v1", "cheap-1"])
  assert.equal(moved.code, 0)
  assert.match(
    moved.stderr,
    /^warn: the worker moved from 127\.0\.0\.1:\d+ to other\.invalid and the stored key stays: run ccsaver key set /,
  )
  const back = await ccsaver(["worker", "set", server.url, "cheap-2"])
  assert.match(back.stderr, /^warn: the worker moved from other\.invalid to 127\.0\.0\.1:\d+ /)
  assert.equal((await ccsaver(["worker", "set", server.url, "cheap-1"])).stderr, "")
})
