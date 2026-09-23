import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { GATE, type Ran, run, tempDir, writeHome } from "../test.helpers.ts"

const HOME = tempDir("gate-home")
const EMPTY_HOME = tempDir("gate-empty")
const WORK = tempDir("gate-work")
const PLUGGED = join(WORK, "proj-a")
const DEEP = join(PLUGGED, "deep", "er")
const SIBLING = join(WORK, "proj-ab")
const OTHER = join(WORK, "other")
const LONG = join(WORK, "long.txt")
const FAKE_BIN = join(WORK, "bin")
const MARKER = join(WORK, "node-was-launched")
const INPUT = JSON.stringify({ tool_input: { file_path: LONG } })

for (const dir of [DEEP, SIBLING, OTHER, FAKE_BIN]) mkdirSync(dir, { recursive: true })
writeFileSync(LONG, "x\n".repeat(351))
writeFileSync(join(FAKE_BIN, "node"), `#!/bin/sh\n: > "${MARKER}"\n`)
chmodSync(join(FAKE_BIN, "node"), 0o755)
writeHome(HOME, { plugged: [["", "strict-ts"], [join(WORK, "unrelated")], [PLUGGED, "strict-ts"]] })

const gate = (project: string, env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run("sh", [GATE, "read-gate"], { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: project, ...env }, INPUT)

after(() => {
  for (const dir of [HOME, EMPTY_HOME, WORK]) rmSync(dir, { recursive: true, force: true })
})

test("a plugged project is denied, and the hook input reaches node through the gate", async () => {
  const out = await gate(PLUGGED)
  assert.equal(out.code, 0)
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  assert.ok(out.stdout.includes(LONG))
  assert.equal(existsSync(join(HOME, "cache")), true)
})

test("a subfolder of a plugged project is denied", async () => {
  assert.match((await gate(DEEP)).stdout, /"permissionDecision":"deny"/)
})

test("an unplugged project gets nothing", async () => {
  assert.deepEqual(await gate(OTHER), { code: 0, stdout: "", stderr: "" })
})

test("a sibling sharing the prefix of a plugged root gets nothing", async () => {
  assert.deepEqual(await gate(SIBLING), { code: 0, stdout: "", stderr: "" })
})

test("no state file means nothing", async () => {
  assert.deepEqual(await gate(PLUGGED, { CCSAVER_HOME: EMPTY_HOME }), {
    code: 0,
    stdout: "",
    stderr: "",
  })
})

test("node is only launched for a plugged project", async () => {
  const path = `${FAKE_BIN}:${process.env["PATH"] ?? ""}`
  await gate(OTHER, { PATH: path })
  assert.equal(existsSync(MARKER), false)
  await gate(PLUGGED, { PATH: path })
  assert.equal(existsSync(MARKER), true)
})
