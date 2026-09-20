import assert from "node:assert/strict"
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import {
  linesIn,
  loadAdapter,
  plug,
  pluggedRootOf,
  readPlugged,
  tokensIn,
  unplug,
  writeLimits,
} from "../src/config.ts"
import { readWorker, setFallback, writeWorker } from "../src/endpoint.ts"
import { isEncrypted, messageOf, Refusal, scrubbed } from "../src/state.ts"
import { tempDir } from "./helpers.ts"

const AS_ROOT = process.getuid?.() === 0

const WORK = tempDir("state-work")
const HOME = join(WORK, "holds-state", "ccsaver")
const USER_HOME = join(WORK, "people", "me")
const PROJECT = join(WORK, "project")
const NESTED = join(PROJECT, "packages", "inner")
const SIBLING = join(WORK, "project-two")

for (const dir of [HOME, USER_HOME, NESTED, SIBLING, join(HOME, "adapters")])
  mkdirSync(dir, { recursive: true })
process.env["CCSAVER_HOME"] = HOME
process.env["HOME"] = USER_HOME

after(() => {
  rmSync(WORK, { recursive: true, force: true })
})

test("plug stores the real path, list shows it, unplug removes it", () => {
  const link = join(WORK, "link-to-project")
  symlinkSync(PROJECT, link)
  assert.deepEqual(plug(link, "strict-ts"), {
    entry: { root: PROJECT, adapter: "strict-ts" },
    was: undefined,
  })
  assert.deepEqual(plug(SIBLING).entry, { root: SIBLING })
  assert.deepEqual(plug(PROJECT), {
    entry: { root: PROJECT },
    was: { root: PROJECT, adapter: "strict-ts" },
  })
  assert.deepEqual(readPlugged(), [{ root: SIBLING }, { root: PROJECT }])
  assert.deepEqual(plug(PROJECT), { entry: { root: PROJECT }, was: { root: PROJECT } })
  assert.deepEqual(readPlugged(), [{ root: SIBLING }, { root: PROJECT }])
  assert.equal(statSync(join(HOME, "plugged")).mode & 0o777, 0o600)
  assert.equal(statSync(HOME).mode & 0o777, 0o700)
  assert.deepEqual(readdirSync(HOME).sort(), ["adapters", "plugged"])
  assert.equal(unplug(link), true)
  assert.equal(unplug(link), false)
  assert.deepEqual(readPlugged(), [{ root: SIBLING }])
})

test("unplug still works after the folder is gone", () => {
  const doomed = join(WORK, "doomed")
  mkdirSync(doomed)
  plug(doomed)
  rmSync(doomed, { recursive: true })
  assert.equal(unplug(doomed), true)
})

test("plug refuses the filesystem root, the home and any root holding the state folder", () => {
  assert.throws(() => plug("/"), /refusing to plug/)
  assert.throws(() => plug(USER_HOME), /refusing to plug/)
  assert.throws(() => plug(join(WORK, "people")), /refusing to plug/)
  assert.throws(() => plug(join(WORK, "holds-state")), /refusing to plug/)
  assert.throws(() => plug(HOME), /refusing to plug/)
})

test("plug refuses a root that is itself a store of credentials", () => {
  const stores = [".ssh", ".aws", ".gnupg", ".kube", ".git", "secrets", ".secrets"]
  for (const name of stores) {
    const store = join(WORK, name)
    mkdirSync(store, { recursive: true })
    assert.throws(() => plug(store), /credentials live/, name)
  }
  const inside = join(WORK, "secrets", "project")
  mkdirSync(inside, { recursive: true })
  assert.deepEqual(plug(inside).entry, { root: inside })
  unplug(inside)
})
test("plug refuses what is not a folder and a path that would break the state file", () => {
  const file = join(WORK, "a-file.txt")
  const broken = join(WORK, "injected\n/etc")
  writeFileSync(file, "x\n")
  mkdirSync(broken, { recursive: true })
  assert.throws(() => plug(file), /not a directory/)
  assert.throws(() => plug(join(WORK, "missing")), /not a directory/)
  assert.throws(() => plug(broken), /line break/)
  assert.equal(readFileSync(join(HOME, "plugged"), "utf8").includes("injected"), false)
})

test("plug refuses an adapter that does not exist or whose name walks the tree", () => {
  assert.throws(() => plug(PROJECT, "no-such-adapter"), /not found/)
  assert.throws(
    () => plug(PROJECT, "../../etc/passwd"),
    /lowercase letters, digits and dashes; not: \.\.\/\.\.\/etc\/passwd$/,
  )
})

test("a private adapter shadows the bundled one, and a malformed one is rejected", () => {
  assert.match(loadAdapter("strict-ts").rules ?? "", /no comments of any kind/)
  writeFileSync(join(HOME, "adapters", "strict-ts.json"), JSON.stringify({ rules: "mine" }))
  assert.deepEqual(loadAdapter("strict-ts"), { rules: "mine" })
  rmSync(join(HOME, "adapters", "strict-ts.json"))
  writeFileSync(join(HOME, "adapters", "typo.json"), JSON.stringify({ rule: "misspelt key" }))
  writeFileSync(join(HOME, "adapters", "empty-format.json"), JSON.stringify({ format: [] }))
  writeFileSync(join(HOME, "adapters", "bad-json.json"), "{")
  assert.throws(() => loadAdapter("typo"), /malformed/)
  assert.throws(() => loadAdapter("bad-json"), /malformed: .*bad-json\.json/)
  assert.throws(() => loadAdapter("empty-format"), /malformed/)
})

test("a corrupt state line never plugs the whole disk", () => {
  const kept = readFileSync(join(HOME, "plugged"), "utf8")
  writeFileSync(join(HOME, "plugged"), `\tstrict-ts\n/\t\nrelative/path\t\n${kept}`)
  assert.equal(pluggedRootOf("/etc"), undefined)
  assert.equal(
    readPlugged().every(({ root }) => root.startsWith("/") && root !== "/"),
    true,
  )
  assert.equal(readPlugged().length, kept.split("\n").length - 1)
})

test("the deepest plugged root wins and a sibling prefix never matches", () => {
  plug(PROJECT)
  plug(NESTED, "strict-ts")
  assert.deepEqual(pluggedRootOf(join(NESTED, "src")), { root: NESTED, adapter: "strict-ts" })
  assert.deepEqual(pluggedRootOf(join(PROJECT, "docs")), { root: PROJECT })
  assert.equal(pluggedRootOf(join(WORK, "project-three")), undefined)
  unplug(NESTED)
  unplug(PROJECT)
})

test("a state folder that cannot be made private is a refusal, not a crash", {
  skip: AS_ROOT,
}, () => {
  const shut = join(WORK, "shut")
  mkdirSync(shut, { recursive: true })
  chmodSync(shut, 0o500)
  process.env["CCSAVER_HOME"] = join(shut, "state")
  assert.throws(
    () => plug(SIBLING),
    (error: unknown): boolean =>
      error instanceof Refusal && /cannot be written: EACCES/.test(messageOf(error)),
  )
  process.env["CCSAVER_HOME"] = HOME
  chmodSync(shut, 0o700)
})

test("the worker url must be encrypted and the pinned fallback survives a new worker", () => {
  assert.throws(() => writeWorker("http://example.invalid/v1", "m"), /https/)
  assert.throws(() => writeWorker("not a url", "m"), /https/)
  assert.throws(() => writeWorker("https://example.invalid/v1", ""), /model/)
  for (const carried of [
    "https://me:token@example.invalid/v1",
    "https://:token@example.invalid/v1",
  ])
    assert.throws(() => writeWorker(carried, "m"), /user name or password/, carried)
  assert.deepEqual(
    ["http://[::1]:8080/v1", "http://localhost/v1", "http://127.0.0.1/v1"].map(isEncrypted),
    [true, true, true],
  )
  assert.deepEqual(
    [
      "http://[::2]/v1",
      "http://example.invalid/v1",
      "ftp://localhost/v1",
      "ws://127.0.0.1/v1",
      "file://localhost/v1",
    ].map(isEncrypted),
    [false, false, false, false, false],
  )
  assert.throws(() => writeWorker("ftp://localhost/v1", "m"), /https/)
  writeFileSync(
    join(HOME, "worker.json"),
    JSON.stringify({ url: "https://a.invalid", model: "a", claude: "/opt/claude" }),
  )
  writeWorker("https://b.invalid/v1", "b")
  assert.deepEqual(readWorker(), { url: "https://b.invalid/v1", model: "b", claude: "/opt/claude" })
  assert.equal(statSync(join(HOME, "worker.json")).mode & 0o777, 0o600)
})

test("the fallback switch is stored, survives a new worker and needs a worker either way", () => {
  setFallback(false)
  assert.deepEqual(readWorker(), {
    url: "https://b.invalid/v1",
    model: "b",
    claude: "/opt/claude",
    fallback: false,
  })
  writeWorker("https://c.invalid/v1", "c")
  assert.equal(readWorker()?.fallback, false)
  setFallback(true)
  assert.equal(readWorker()?.fallback, true)
  rmSync(join(HOME, "worker.json"))
  assert.throws(() => setFallback(true), /run: ccsaver worker set <url> <model>$/)
  assert.throws(() => setFallback(false), /run: ccsaver worker set <url> <model>$/)
  assert.equal(readWorker(), undefined)
})

test("a worker.json that is there but wrong is an error, never the same as no worker", () => {
  const file = join(HOME, "worker.json")
  const wrong = [
    "{",
    "[]",
    JSON.stringify({ url: "https://a.invalid" }),
    JSON.stringify({ url: "https://a.invalid", model: "a", fallback: "false" }),
    JSON.stringify({ url: "https://a.invalid", model: "a", claude: 7 }),
  ]
  for (const text of wrong) {
    writeFileSync(file, text)
    assert.throws(readWorker, /worker\.json is malformed: fix it or delete it/, text)
    assert.throws(() => setFallback(true), /malformed/, text)
  }
  writeFileSync(file, JSON.stringify({ url: "https://a.invalid", model: "a", claude: "" }))
  assert.deepEqual(readWorker(), { url: "https://a.invalid", model: "a" })
  rmSync(file)
})

test("a worker.json that cannot be read stops the call, never reads as no worker", {
  skip: AS_ROOT,
}, () => {
  const file = join(HOME, "worker.json")
  const stored = { url: "https://a.invalid", model: "a", fallback: false }
  writeFileSync(file, JSON.stringify(stored))
  chmodSync(file, 0o000)
  assert.throws(readWorker, /worker\.json cannot be read: check its owner and its mode/)
  assert.throws(() => setFallback(true), /cannot be read/)
  chmodSync(file, 0o600)
  assert.deepEqual(readWorker(), stored)
  rmSync(file)
})

test("an adapter that is there but cannot be read is an error, never read as absent or as the bundled one", {
  skip: AS_ROOT,
}, () => {
  const mine = join(HOME, "adapters", "strict-ts.json")
  const kept = JSON.stringify({ rules: "mine", format: ["tools/fmt"], maxLines: 900 })
  writeFileSync(mine, kept)
  chmodSync(mine, 0o000)
  assert.throws(
    () => loadAdapter("strict-ts"),
    /adapter strict-ts cannot be read: .*strict-ts\.json$/,
  )
  assert.throws(() => writeLimits("strict-ts", { maxTokens: 9000 }), /cannot be read/)
  chmodSync(mine, 0o600)
  assert.equal(readFileSync(mine, "utf8"), kept)
  rmSync(mine)
})

test("lines are counted the way Read numbers them, and bytes/4 rounds half up", () => {
  const texts = ["", "x", "x\n", "\n", "x\nx", "a\r\nb\r\n", "\n\n"]
  assert.deepEqual(
    texts.map((text) => linesIn(Buffer.from(text))),
    [0, 1, 1, 1, 2, 2, 2],
  )
  assert.deepEqual(
    [0, 1, 2, 3, 32_000, 32_001, 32_002].map(tokensIn),
    [0, 0, 1, 1, 8000, 8000, 8001],
  )
})

test("scrubbed escapes every control character but the line break and the tab", () => {
  assert.equal(scrubbed("a\rb\u009bc\u0000d\ne\tf"), "a\\x0db\\x9bc\\x00d\ne\tf")
})
