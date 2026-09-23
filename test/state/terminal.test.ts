import assert from "node:assert/strict"
import { rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { HAS_PTY, LAUNCHER, type Ran, run, tempDir } from "../test.helpers.ts"

const HOME = tempDir("terminal-home")
const GREEN = "\u001b[32m"
const YELLOW = "\u001b[33m"
const RED = "\u001b[31m"
const CYAN = "\u001b[36m"
const PLAIN = "\u001b[0m"

const onTerminal = (args: string, env = ""): Promise<Ran> =>
  run("script", ["-qec", `env ${env} CCSAVER_HOME=${HOME} "${LAUNCHER}" ${args}`, "/dev/null"], {})

after(() => {
  rmSync(HOME, { recursive: true, force: true })
})

test("on a terminal a change is marked ✓, a repeat →, a warning ! and an error ✗, each in its colour", {
  skip: !HAS_PTY,
  timeout: 60_000,
}, async () => {
  const on = await onTerminal("log on")
  assert.ok(on.stdout.includes(`${GREEN}✓${PLAIN} log on: recording metadata only in `), on.stdout)
  const again = await onTerminal("log on")
  assert.ok(again.stdout.includes(`${CYAN}→${PLAIN} the log is already on`), again.stdout)
  const wrong = await onTerminal("fallback sideways")
  assert.ok(
    wrong.stdout.includes(
      `${RED}✗ Error:${PLAIN} fallback takes on or off, not: sideways\r\nusage: ccsaver fallback on|off`,
    ),
    wrong.stdout,
  )
  writeFileSync(join(HOME, "api-key"), "k-terminal-0123456789\n", { mode: 0o600 })
  await onTerminal("worker set https://one.invalid/v1 m")
  const moved = await onTerminal("worker set https://two.invalid/v1 m")
  assert.ok(
    moved.stdout.includes(`${GREEN}✓${PLAIN} worker set to https://two.invalid/v1 · m`),
    moved.stdout,
  )
  assert.ok(
    moved.stdout.includes(
      `${YELLOW}! warn:${PLAIN} the worker moved from one.invalid to two.invalid`,
    ),
    moved.stdout,
  )
  const doctor = await onTerminal("doctor")
  assert.ok(doctor.stdout.includes(`${GREEN}✓ ok  ${PLAIN} state: `), doctor.stdout)
  assert.ok(doctor.stdout.includes(`${YELLOW}! warn${PLAIN} plugged: nothing`), doctor.stdout)
  assert.ok(doctor.stdout.includes(`${RED}✗ FAIL${PLAIN} key: set aside in `), doctor.stdout)
  assert.match(
    doctor.stdout,
    new RegExp(
      `\r\n${RED.replace("[", "\\[")}✗${PLAIN.replace("[", "\\[")} \\d+ checks: \\d+ ok, \\d+ warn, [1-9]\\d* FAIL\r\n`,
    ),
  )
})

test("NO_COLOR and TERM=dumb leave a terminal as plain as a pipe: no mark, no escape", {
  skip: !HAS_PTY,
  timeout: 30_000,
}, async () => {
  for (const env of ["NO_COLOR=1", "TERM=dumb"]) {
    const out = await onTerminal("log on", env)
    assert.ok(out.stdout.startsWith("the log is already on"), `${env}\n${out.stdout}`)
    assert.deepEqual([out.stdout.includes("\u001b"), out.stdout.includes("→")], [false, false], env)
  }
})
