import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { HOOK, type Ran, run, tempDir, writeHome } from "../helpers.ts"

const HOME = tempDir("hook-home")
const WORK = tempDir("hook-work")
const PROJECT = join(WORK, "project")
const ROOMY = join(WORK, "roomy")
const BROKEN = join(WORK, "broken")
const UNPLUGGED = join(WORK, "unplugged")

for (const dir of [PROJECT, ROOMY, BROKEN, UNPLUGGED, join(HOME, "adapters")])
  mkdirSync(dir, { recursive: true })
writeHome(HOME, { plugged: [[PROJECT], [ROOMY, "roomy"], [BROKEN, "broken"]] })
writeFileSync(
  join(HOME, "adapters", "roomy.json"),
  JSON.stringify({ maxLines: 1000, maxTokens: 20000 }),
)
writeFileSync(join(HOME, "adapters", "broken.json"), JSON.stringify({ maxLines: "abc" }))

const fileOf = (name: string, lines: number): string => {
  const path = join(WORK, name)
  writeFileSync(path, "x\n".repeat(lines))
  return path
}

const LONG = fileOf("long.txt", 351)
const EDGE = fileOf("edge.txt", 350)
const HEAVY = join(WORK, "heavy.md")
writeFileSync(HEAVY, `${"word ".repeat(8000)}\n`)

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
  assert.equal(await denied({ tool_input: { file_path: LONG } }, ROOMY), false)
  assert.equal(await denied({ tool_input: { file_path: HEAVY } }, ROOMY), false)
})

test("keeps the default limits when the adapter is malformed", async () => {
  assert.equal(await denied({ tool_input: { file_path: LONG } }, BROKEN), true)
})

test("denies a file it cannot read whole, and never reports lines it did not count", async () => {
  const huge = join(WORK, "huge.txt")
  writeFileSync(huge, "x\n".repeat(4096))
  truncateSync(huge, 2_200_000_000)
  const out = await said({ tool_input: { file_path: huge } })
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  assert.match(out.stdout, /2200000000 bytes, too big to count its lines/)
  assert.equal(out.stdout.includes("has 0 lines"), false)
})

test("denies by bytes without reading a file that is past the limit", async () => {
  const wide = join(WORK, "wide.md")
  writeFileSync(wide, `${"word ".repeat(9000)}\n`)
  const out = await said({ tool_input: { file_path: wide } })
  assert.match(out.stdout, /45001 bytes, too big to count its lines, ~11250 tokens/)
})
test("lets a binary file through", async () => {
  const path = join(WORK, "blob.bin")
  writeFileSync(path, Buffer.concat([Buffer.from("x\n".repeat(400)), Buffer.from([0])]))
  assert.equal(await denied({ tool_input: { file_path: path } }), false)
})

test("does nothing in a project that is not plugged in", async () => {
  assert.equal(await denied({ tool_input: { file_path: LONG } }, UNPLUGGED), false)
})

test("denies a file one byte past the byte limit, however few lines it has, and lets one at the limit through", async () => {
  const row = `${"x".repeat(99)}\n`
  const atLimit = join(WORK, "at-limit.txt")
  const pastLimit = join(WORK, "past-limit.txt")
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
  const bare = join(WORK, "bare.txt")
  const partial = join(WORK, "partial.txt")
  const empty = join(WORK, "empty.txt")
  const alias = join(WORK, "alias.txt")
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
