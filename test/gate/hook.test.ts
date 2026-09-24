import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { HOOK, type Ran, run, tempDir, writeHome } from "../test.helpers.ts"

const HOME = tempDir("hook-home")
const WORK = tempDir("hook-work")
const PROJECT = join(WORK, "project")
const ROOMY = join(WORK, "roomy")
const BROKEN = join(WORK, "broken")
const UNPLUGGED = join(WORK, "unplugged")
const CUT = join(WORK, "cut")

for (const dir of [PROJECT, ROOMY, BROKEN, UNPLUGGED, CUT, join(HOME, "adapters")])
  mkdirSync(dir, { recursive: true })
writeHome(HOME, { plugged: [[PROJECT], [ROOMY, "roomy"], [BROKEN, "broken"], [CUT, "cut"]] })
writeFileSync(join(HOME, "adapters", "cut.json"), JSON.stringify({ rewrite: true }))
writeFileSync(
  join(HOME, "adapters", "roomy.json"),
  JSON.stringify({ maxLines: 1000, maxTokens: 20000 }),
)
writeFileSync(join(HOME, "adapters", "broken.json"), JSON.stringify({ maxLines: "abc" }))

const fileOf = (name: string, lines: number, dir = PROJECT): string => {
  const path = join(dir, name)
  writeFileSync(path, "x\n".repeat(lines))
  return path
}

const LONG = fileOf("long.txt", 351)
const EDGE = fileOf("edge.txt", 350)
const HEAVY = join(PROJECT, "heavy.md")
writeFileSync(HEAVY, `${"word ".repeat(8000)}\n`)
const ROOMY_LONG = fileOf("long.txt", 351, ROOMY)
const ROOMY_HEAVY = join(ROOMY, "heavy.md")
writeFileSync(ROOMY_HEAVY, `${"word ".repeat(8000)}\n`)
const BROKEN_LONG = fileOf("long.txt", 351, BROKEN)
const OUTSIDE_LONG = fileOf("outside-long.txt", 351, WORK)
const CUT_LONG = fileOf("long.txt", 351, CUT)
const CUT_SMALL = fileOf("small.txt", 100, CUT)
const CUT_SECRET = fileOf("id_rsa", 351, CUT)
const CUT_HEAVY = join(CUT, "heavy.md")
writeFileSync(CUT_HEAVY, `${"word ".repeat(8000)}\n`)

const said = (input: unknown, project = PROJECT): Promise<Ran> =>
  run("node", [HOOK], { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: project }, JSON.stringify(input))

const denied = async (input: unknown, project = PROJECT): Promise<boolean> => {
  const out = await run(
    "node",
    [HOOK],
    { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: project },
    JSON.stringify(input),
  )
  assert.equal(out.code, 0)
  return out.stdout.includes('"permissionDecision":"deny"')
}

after(() => {
  for (const dir of [HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("denies a whole-file Read over the threshold and names the plugin skill", async () => {
  const out = await run(
    "node",
    [HOOK],
    { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT },
    JSON.stringify({ tool_input: { file_path: LONG } }),
  )
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  assert.match(out.stdout, /\/ccsaver:bulk-reader/)
})

test("allows a file at the threshold, a missing file and a malformed input", async () => {
  assert.equal(await denied({ tool_input: { file_path: EDGE } }), false)
  assert.equal(await denied({ tool_input: { file_path: join(WORK, "missing.txt") } }), false)
  assert.equal(await denied({ tool_input: "nope" }), false)
  assert.equal(await denied("not even an object"), false)
})

test("fails open on input that is not JSON", async () => {
  const env = { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: PROJECT }
  const out = await run("node", [HOOK], env, "not json")
  assert.equal(out.code, 0)
  assert.equal(out.stdout, "")
})

test("allows any ranged Read, and a null range is no range", async () => {
  assert.equal(await denied({ tool_input: { file_path: LONG, limit: 2000 } }), false)
  assert.equal(await denied({ tool_input: { file_path: LONG, offset: 10 } }), false)
  assert.equal(await denied({ tool_input: { file_path: LONG, offset: null, limit: null } }), true)
})

test("applies to subagents too", async () => {
  assert.equal(await denied({ agent_type: "Explore", tool_input: { file_path: LONG } }), true)
})

test("denies a short file that is heavy in tokens", async () => {
  assert.equal(await denied({ tool_input: { file_path: HEAVY } }), true)
})

test("takes the limits from the adapter of the project", async () => {
  assert.equal(await denied({ tool_input: { file_path: ROOMY_LONG } }, ROOMY), false)
  assert.equal(await denied({ tool_input: { file_path: ROOMY_HEAVY } }, ROOMY), false)
})

test("under an adapter with rewrite, a read the hook would deny becomes its first 350 lines with a note, and every other read is left alone", async () => {
  const out = await said({ tool_input: { file_path: CUT_LONG } }, CUT)
  assert.match(out.stdout, /"permissionDecision":"allow"/)
  assert.ok(
    out.stdout.includes(`"updatedInput":{"file_path":"${CUT_LONG}","offset":1,"limit":350}`),
    out.stdout,
  )
  assert.match(
    out.stdout,
    /"additionalContext":"\S+ has 351 lines, ~176 tokens by bytes\/4 and about twice that as a Read \(limits 350 lines, 8000 tokens\): this Read was cut to lines 1-350\. Grep to locate, \/ccsaver:bulk-reader to understand it whole, a ranged Read with offset and limit for the rest\."/,
  )
  const heavy = await said({ tool_input: { file_path: CUT_HEAVY } }, CUT)
  assert.match(heavy.stdout, /"limit":350/)
  assert.match(heavy.stdout, /40001 bytes, too big to count its lines/)
  for (const path of [CUT_SMALL, CUT_SECRET])
    assert.equal((await said({ tool_input: { file_path: path } }, CUT)).stdout, "", path)
  assert.equal((await said({ tool_input: { file_path: CUT_LONG, offset: 5 } }, CUT)).stdout, "")
})

test("keeps the default limits when the adapter is malformed", async () => {
  assert.equal(await denied({ tool_input: { file_path: BROKEN_LONG } }, BROKEN), true)
})

test("a file outside the plugged root is never denied, however long", async () => {
  assert.equal(await denied({ tool_input: { file_path: OUTSIDE_LONG } }), false)
  const ranged = { file_path: OUTSIDE_LONG, offset: 1, limit: 5 }
  assert.equal(await denied({ tool_input: ranged }), false)
})

test("denies a file it cannot read whole, and never reports lines it did not count", async () => {
  const huge = join(PROJECT, "huge.txt")
  writeFileSync(huge, "x\n".repeat(4096))
  truncateSync(huge, 2_200_000_000)
  const out = await said({ tool_input: { file_path: huge } })
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  assert.match(out.stdout, /2200000000 bytes, too big to count its lines/)
  assert.equal(out.stdout.includes("has 0 lines"), false)
})

test("denies by bytes without reading a file that is past the limit", async () => {
  const wide = join(PROJECT, "wide.md")
  writeFileSync(wide, `${"word ".repeat(9000)}\n`)
  const out = await said({ tool_input: { file_path: wide } })
  assert.match(out.stdout, /45001 bytes, too big to count its lines, ~11250 tokens/)
})
test("lets a binary file through", async () => {
  const path = join(PROJECT, "blob.bin")
  writeFileSync(path, Buffer.concat([Buffer.from("x\n".repeat(400)), Buffer.from([0])]))
  assert.equal(await denied({ tool_input: { file_path: path } }), false)
})

test("does nothing in a project that is not plugged in", async () => {
  assert.equal(await denied({ tool_input: { file_path: LONG } }, UNPLUGGED), false)
})

test("denies a file one byte past the byte limit, however few lines it has, and lets one at the limit through", async () => {
  const row = `${"x".repeat(99)}\n`
  const atLimit = join(PROJECT, "at-limit.txt")
  const pastLimit = join(PROJECT, "past-limit.txt")
  writeFileSync(atLimit, row.repeat(320))
  writeFileSync(pastLimit, `${row.repeat(320)}x`)
  assert.equal(await denied({ tool_input: { file_path: atLimit } }), false)
  const out = await said({ tool_input: { file_path: pastLimit } })
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  assert.match(out.stdout, /32001 bytes, too big to count its lines, ~8000 tokens/)
})

test("a Read of what is no regular file is let through at once, never waited on", {
  timeout: 15_000,
}, async () => {
  const pipe = join(WORK, "pipe")
  const made = spawnSync("mkfifo", [pipe]).status === 0
  assert.equal(await denied({ tool_input: { file_path: WORK } }), false)
  if (made) assert.equal(await denied({ tool_input: { file_path: pipe } }), false)
})

test("a last line without its newline counts, an empty file passes, and a symlink is judged by its target", async () => {
  const bare = join(PROJECT, "bare.txt")
  const partial = join(PROJECT, "partial.txt")
  const empty = join(PROJECT, "empty.txt")
  const alias = join(PROJECT, "alias.txt")
  writeFileSync(bare, "x\n".repeat(350).slice(0, -1))
  writeFileSync(partial, `${"x\n".repeat(350)}x`)
  writeFileSync(empty, "")
  symlinkSync(LONG, alias)
  assert.equal(await denied({ tool_input: { file_path: bare } }), false)
  assert.equal(await denied({ tool_input: { file_path: partial } }), true)
  assert.equal(await denied({ tool_input: { file_path: empty } }), false)
  assert.equal(await denied({ tool_input: { file_path: alias } }), true)
})

test("without CLAUDE_PROJECT_DIR the hook judges from the working directory", async () => {
  const env = { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: "" }
  const input = JSON.stringify({ tool_input: { file_path: LONG } })
  const here = await run("node", [HOOK], env, input, PROJECT)
  assert.match(here.stdout, /"permissionDecision":"deny"/)
  assert.equal((await run("node", [HOOK], env, input, UNPLUGGED)).stdout, "")
})

test("lets through a file over the limits that bulk-read would refuse, up to a megabyte, because denying it could only cost", async () => {
  const secretName = fileOf("id_rsa", 351)
  const keyed = join(PROJECT, "keyed.txt")
  const tokened = join(PROJECT, "tokened.txt")
  const wideKeyed = join(PROJECT, "wide-keyed.md")
  const hugeKeyed = join(PROJECT, "huge-keyed.md")
  writeFileSync(keyed, `${"x\n".repeat(351)}-----BEGIN RSA PRIVATE KEY-----\n`)
  writeFileSync(tokened, `${"x\n".repeat(351)}key = AKIAABCDEFGHIJKLMNOP\n`)
  writeFileSync(wideKeyed, `${"word ".repeat(9000)}\n-----BEGIN PGP PRIVATE KEY BLOCK-----\n`)
  writeFileSync(hugeKeyed, `${"word ".repeat(210_000)}\n-----BEGIN RSA PRIVATE KEY-----\n`)
  for (const path of [secretName, keyed, tokened, wideKeyed])
    assert.equal(await denied({ tool_input: { file_path: path } }), false, path)
  assert.equal(await denied({ tool_input: { file_path: hugeKeyed } }), true)
})

test("a file where credentials live is let through by its place, past a megabyte too, and a NUL past the first 8 KB is found once the file is about to be denied", async () => {
  mkdirSync(join(PROJECT, ".ssh"), { recursive: true })
  const placed = fileOf(join(".ssh", "notes"), 351)
  const hugePlaced = join(PROJECT, ".ssh", "known_hosts.md")
  writeFileSync(hugePlaced, `${"word ".repeat(210_000)}\n`)
  const lateNul = join(PROJECT, "late-nul.md")
  writeFileSync(
    lateNul,
    Buffer.concat([Buffer.from(`${"word ".repeat(9000)}\n`), Buffer.from([0])]),
  )
  for (const path of [placed, hugePlaced, lateNul])
    assert.equal(await denied({ tool_input: { file_path: path } }), false, path)
})
