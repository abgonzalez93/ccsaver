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
  loadAdapter,
  plug,
  pluggedRootOf,
  readPlugged,
  readWorker,
  setFallback,
  unplug,
  writeWorker,
} from "../src/config.ts"
import { isEncrypted } from "../src/state.ts"
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
  assert.deepEqual(plug(link, "strict-ts"), { root: PROJECT, adapter: "strict-ts" })
  assert.deepEqual(plug(SIBLING), { root: SIBLING })
  assert.deepEqual(plug(PROJECT), { root: PROJECT })
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
  assert.deepEqual(plug(inside), { root: inside })
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
