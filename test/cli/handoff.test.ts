import assert from "node:assert/strict"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { AS_ROOT, events, jsonOf, LAUNCHER, type Ran, run, tempDir } from "../test.helpers.ts"

const HOME = tempDir("handoff-cli-home")
const DIR = join(HOME, "handoff")
const FILE = join(HOME, "handoff.json")
const ON = "a warning at the end of the turn that takes the context past the limit"
const OFF = "no warning; /ccsaver:handoff still works by hand"

const ccsaver = (args: string[], input = "", env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run(LAUNCHER, args, { CCSAVER_HOME: HOME, CLAUDE_CODE_SESSION_ID: "session-cli", ...env }, input)

const configs = (): number => events(HOME).filter(({ kind }) => kind === "config").length

const kept = (): string[] => readdirSync(DIR).filter((name) => name.endsWith(".md"))

mkdirSync(join(HOME, "log"), { recursive: true, mode: 0o700 })
chmodSync(join(HOME, "log"), 0o700)

after(() => {
  rmSync(HOME, { recursive: true, force: true })
})

test("with nothing stored the warning is on at 200,000 tokens, and nothing has been written", async () => {
  const out = await ccsaver(["handoff"])
  assert.deepEqual(
    [out.code, out.stdout],
    [0, `handoff on · limit 200000 tokens · nothing kept yet in ${DIR}\n`],
  )
  assert.equal(existsSync(FILE), false)
})

test("on, off and a limit answer already when nothing changes, and record one config event when something does", async () => {
  const before = configs()
  const on = await ccsaver(["handoff", "on"])
  assert.deepEqual([on.code, on.stdout], [0, `the handoff warning is already on: ${ON}\n`])
  assert.equal(existsSync(FILE), false)
  assert.equal((await ccsaver(["handoff", "off"])).stdout, `handoff off: ${OFF}\n`)
  assert.deepEqual(jsonOf(FILE), { on: false, limit: 200_000 })
  assert.equal(statSync(FILE).mode & 0o777, 0o600)
  assert.equal(
    (await ccsaver(["handoff", "off"])).stdout,
    `the handoff warning is already off: ${OFF}\n`,
  )
  assert.equal(
    (await ccsaver(["handoff", "300000"])).stdout,
    "handoff limit 300000 tokens (was 200000)\n",
  )
  assert.equal(
    (await ccsaver(["handoff", "300000"])).stdout,
    "the handoff limit is already 300000 tokens\n",
  )
  assert.deepEqual(jsonOf(FILE), { on: false, limit: 300_000 })
  assert.equal((await ccsaver(["handoff", "on"])).stdout, `handoff on: ${ON}\n`)
  assert.match(
    (await ccsaver(["handoff"])).stdout,
    /^handoff on · limit 300000 tokens · nothing kept yet/,
  )
  assert.equal(configs() - before, 3)
  const recorded = events(HOME).filter(
    ({ kind, action }) => kind === "config" && action === "handoff",
  )
  assert.deepEqual(
    recorded.map(({ on, limit }) => [on, limit]),
    [
      [false, undefined],
      [undefined, 300_000],
      [true, undefined],
    ],
  )
})

test("write keeps what stdin holds under the session's name, private, and says how to open the next session", async () => {
  const text = "# Handoff\n\nGoal: ship it.\n"
  const out = await ccsaver(["handoff", "write"], text)
  const place = join(DIR, "session-cli.md")
  assert.equal(out.code, 0)
  assert.equal(
    out.stdout.split("\n")[0],
    `handoff kept in ${place} (3 lines, ${Buffer.byteLength(text)} bytes)`,
  )
  assert.match(
    out.stdout,
    /\nnext session, in a terminal: claude "Read \S+session-cli\.md whole, then continue from its next step"\n/,
  )
  assert.match(out.stdout, /\nin VS Code: /)
  assert.equal(readFileSync(place, "utf8"), text)
  assert.equal(statSync(place).mode & 0o777, 0o600)
  assert.equal(statSync(DIR).mode & 0o777, 0o700)
  const written = events(HOME).at(-1)
  assert.deepEqual(
    [
      written?.["kind"],
      written?.["action"],
      written?.["lines"],
      written?.["bytes"],
      written?.["session"],
    ],
    ["handoff", "written", 3, Buffer.byteLength(text), "session-cli"],
  )
  assert.equal(
    (await ccsaver(["handoff"])).stdout,
    `handoff on · limit 300000 tokens · 1 kept in ${DIR}, the latest ${place}\n`,
  )
  const outside = await ccsaver(["handoff", "write"], "no newline at the end", {
    CLAUDE_CODE_SESSION_ID: "",
  })
  assert.equal(outside.code, 0)
  const [name] = kept().filter((file) => file !== "session-cli.md")
  assert.match(name ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.md$/)
  assert.equal(readFileSync(join(DIR, name ?? ""), "utf8"), "no newline at the end\n")
})

test("write refuses what a whole Read would not take, and an empty handoff, writing nothing", async () => {
  const before = kept().length
  const long = await ccsaver(["handoff", "write"], "x\n".repeat(351))
  assert.equal(long.code, 1)
  assert.match(
    long.stderr,
    /^Error: a handoff has to fit one whole Read, 350 lines and 32000 bytes; this one has 351 lines and 702 bytes\n/,
  )
  const heavy = await ccsaver(["handoff", "write"], `${"word ".repeat(6500)}\n`)
  assert.match(heavy.stderr, /this one has 1 line and 32501 bytes/)
  const empty = await ccsaver(["handoff", "write"], "\n\n")
  assert.match(empty.stderr, /^Error: an empty handoff, nothing was written\n/)
  assert.equal(kept().length, before)
})

test("a handoff.json that is there but wrong stops the settings with its name, and write still works", async () => {
  writeFileSync(FILE, '{"on": "yes"}')
  for (const args of [["handoff"], ["handoff", "on"], ["handoff", "1000"]]) {
    const out = await ccsaver(args)
    assert.equal(out.code, 1, args.join(" "))
    assert.match(out.stderr, /^Error: \S+handoff\.json is malformed: fix it or delete it\n/)
  }
  assert.equal((await ccsaver(["handoff", "write"], "still\n")).code, 0)
  for (const text of ["{", "[]", '{"limit": 0}', '{"limit": 1.5}', '{"on": true, "limt": 5}']) {
    writeFileSync(FILE, text)
    assert.match((await ccsaver(["handoff"])).stderr, /is malformed/, text)
  }
  if (!AS_ROOT) {
    writeFileSync(FILE, JSON.stringify({ on: true, limit: 5000 }))
    chmodSync(FILE, 0o000)
    assert.match(
      (await ccsaver(["handoff"])).stderr,
      /^Error: \S+handoff\.json cannot be read: check its owner and its mode\n/,
    )
    chmodSync(FILE, 0o600)
  }
  rmSync(FILE)
})
