import assert from "node:assert/strict"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { HOOK, run, tempDir, writeHome } from "./helpers.ts"

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

test("allows any ranged Read", async () => {
  assert.equal(await denied({ tool_input: { file_path: LONG, limit: 2000 } }), false)
  assert.equal(await denied({ tool_input: { file_path: LONG, offset: 10 } }), false)
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

test("lets a binary file through", async () => {
  const path = join(WORK, "blob.bin")
  writeFileSync(path, Buffer.concat([Buffer.from("x\n".repeat(400)), Buffer.from([0])]))
  assert.equal(await denied({ tool_input: { file_path: path } }), false)
})

test("does nothing in a project that is not plugged in", async () => {
  assert.equal(await denied({ tool_input: { file_path: LONG } }, UNPLUGGED), false)
})
