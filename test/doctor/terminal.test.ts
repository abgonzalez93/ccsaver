import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { after, before, test } from "node:test"
import {
  fakeClaude,
  fakeInstall,
  HAS_PTY,
  jsonOf,
  LAUNCHER,
  type Ran,
  REPO,
  run,
  SHELL_PATH,
  tempDir,
} from "../test.helpers.ts"

const HOME = tempDir("terminal-home")
const WORK = tempDir("terminal-work")
const USER_HOME = tempDir("terminal-user")
const CONFIG = tempDir("terminal-config")
const FAKE = fakeClaude(WORK)
const PLACE = join(USER_HOME, ".local", "bin", "ccsaver")
const BIN = dirname(PLACE)
const VERSION = String(jsonOf(join(REPO, "package.json"))["version"])
const NOT_INSTALLED =
  "Error: ccsaver is not installed: claude plugin install ccsaver@abgonzalez93, or remove this launcher: rm -f ~/.local/bin/ccsaver"

let cache: string

const doctor = (env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run(LAUNCHER, ["doctor"], {
    HOME: USER_HOME,
    CLAUDE_CONFIG_DIR: CONFIG,
    CCSAVER_HOME: HOME,
    CLAUDE_CODE_EXECPATH: FAKE,
    PATH: `${BIN}:${SHELL_PATH}`,
    ...env,
  })

const homeWith = (label: string, launcher: string): string => {
  const home = join(WORK, label)
  mkdirSync(join(home, ".local", "bin"), { recursive: true })
  writeFileSync(join(home, ".local", "bin", "ccsaver"), launcher)
  chmodSync(join(home, ".local", "bin", "ccsaver"), 0o755)
  return home
}

before(() => {
  cache = fakeInstall(CONFIG, VERSION, [VERSION, "9.9.9"])
})

after(() => {
  for (const dir of [HOME, WORK, USER_HOME, CONFIG]) rmSync(dir, { recursive: true, force: true })
})

test("doctor warns when there is no launcher, and when its folder is off the PATH", async () => {
  const out = await doctor({ PATH: SHELL_PATH })
  assert.match(
    out.stdout,
    /^warn launcher: none at \S+\/ccsaver, a terminal of yours answers command not found$/m,
  )
  assert.match(
    out.stdout,
    /^warn path: \S+\/\.local\/bin is not on this PATH; add to your shell profile: export PATH="\$HOME\/\.local\/bin:\$PATH"$/m,
  )
  assert.equal(out.stdout.includes("fix:"), false)
})

test("with the launcher in place and its folder on the PATH, doctor runs it and reports the installed version", async () => {
  const written = await run(LAUNCHER, ["launcher", "write"], {
    HOME: USER_HOME,
    CLAUDE_CONFIG_DIR: CONFIG,
    CCSAVER_HOME: HOME,
    PATH: `${BIN}:${SHELL_PATH}`,
  })
  assert.equal(written.code, 0)
  const out = await doctor()
  assert.match(
    out.stdout,
    new RegExp(`^ok {3}launcher: \\S+/ccsaver runs ${VERSION.replaceAll(".", "\\.")}$`, "m"),
  )
  assert.match(out.stdout, /^ok {3}path: \S+\/\.local\/bin is on this PATH$/m)
  assert.equal(out.stdout.includes("warn launcher:"), false)
})

test("a plugin bin on the PATH does not fool the check, and a ccsaver of someone else's ahead of it is named", async () => {
  const elsewhere = join(WORK, "elsewhere")
  mkdirSync(elsewhere)
  writeFileSync(join(elsewhere, "ccsaver"), "#!/bin/sh\necho mine\n")
  chmodSync(join(elsewhere, "ccsaver"), 0o755)
  const out = await doctor({
    PATH: `${elsewhere}:${BIN}:${SHELL_PATH}:${join(cache, "9.9.9", "bin")}`,
  })
  assert.match(
    out.stdout,
    new RegExp(`^ok {3}launcher: \\S+/ccsaver runs ${VERSION.replaceAll(".", "\\.")}$`, "m"),
  )
  assert.match(
    out.stdout,
    new RegExp(
      `^warn path: ${elsewhere}/ccsaver comes first on this PATH and is not ccsaver's launcher$`,
      "m",
    ),
  )
  assert.match(out.stdout, /^ok {3}path: \S+\/\.local\/bin is on this PATH$/m)
})

test("an older launcher of ccsaver's, and one of someone else's, are told apart and left alone", async () => {
  const older = homeWith("older", "#!/bin/sh\n# ccsaver launcher 0 · older\nexit 3\n")
  const old = await doctor({ HOME: older, PATH: `${join(older, ".local", "bin")}:${SHELL_PATH}` })
  assert.match(old.stdout, /^warn launcher: \S+\/ccsaver is an older launcher of ccsaver's$/m)
  assert.equal(old.stdout.includes("runs"), false)
  const foreign = homeWith("foreign", "#!/bin/sh\necho mine\n")
  const theirs = await doctor({
    HOME: foreign,
    PATH: `${join(foreign, ".local", "bin")}:${SHELL_PATH}`,
  })
  assert.match(
    theirs.stdout,
    /^warn launcher: \S+\/ccsaver is not ccsaver's launcher, left alone$/m,
  )
  assert.equal(existsSync(join(foreign, ".local", "bin", "ccsaver")), true)
})

test("a launcher that finds no installed plugin fails the check with its own words", async () => {
  const gone = join(WORK, "gone")
  mkdirSync(join(gone, "plugins"), { recursive: true })
  writeFileSync(join(gone, "plugins", "installed_plugins.json"), '{"version": 2, "plugins": {}}')
  const out = await doctor({ CLAUDE_CONFIG_DIR: gone })
  assert.equal(out.code, 1)
  assert.match(
    out.stdout,
    new RegExp(
      `^FAIL launcher: \\S+/ccsaver says: ${NOT_INSTALLED.replaceAll(/[.~]/g, "\\$&")}$`,
      "m",
    ),
  )
})

test("doctor says whether the two Bash(ccsaver …) rules are in permissions.allow, and when it cannot tell", async () => {
  const settings = join(CONFIG, "settings.json")
  const allowing = (allow: string[]): void => {
    writeFileSync(settings, JSON.stringify({ permissions: { allow } }))
  }
  const none = await doctor()
  assert.match(
    none.stdout,
    /^warn permissions: \S+settings\.json is not there or cannot be read, so the two Bash\(ccsaver …\) rules could not be checked$/m,
  )
  allowing(["Bash(ccsaver bulk-read *)", "Read"])
  const half = await doctor()
  assert.match(
    half.stdout,
    /^warn permissions: Bash\(ccsaver code-write \*\) not in permissions\.allow of \S+settings\.json: Claude asks before every delegation, and refuses one in print mode$/m,
  )
  assert.equal(half.code, 0)
  allowing(["Bash(ccsaver bulk-read *)", "Bash(ccsaver code-write *)"])
  assert.match(
    (await doctor()).stdout,
    /^ok {3}permissions: the ccsaver rules are in \S+settings\.json$/m,
  )
  allowing(["Bash(ccsaver *)"])
  assert.match((await doctor()).stdout, /^ok {3}permissions: /m)
  writeFileSync(settings, "{")
  assert.match(
    (await doctor()).stdout,
    /^warn permissions: \S+settings\.json is not JSON, so the two Bash\(ccsaver …\) rules could not be checked$/m,
  )
  rmSync(settings)
})

test("a launcher that runs another version than this doctor says so", async () => {
  const other = join(WORK, "other-config")
  fakeInstall(other, "9.9.9", ["9.9.9"])
  const out = await doctor({ CLAUDE_CONFIG_DIR: other })
  assert.equal(out.code, 0)
  assert.match(
    out.stdout,
    new RegExp(
      `^warn launcher: \\S+/ccsaver runs 9\\.9\\.9, and this doctor is ${VERSION.replaceAll(".", "\\.")}: a session keeps the version it loaded until /reload-plugins$`,
      "m",
    ),
  )
})

test("on a terminal doctor offers to write the launcher, writes it on yes and leaves it on no", {
  skip: !HAS_PTY,
  timeout: 30_000,
}, async () => {
  const home = join(WORK, "pty-home")
  const ask = (typed: string): Promise<Ran> =>
    run(
      "script",
      ["-qec", `"${LAUNCHER}" doctor`, "/dev/null"],
      {
        HOME: home,
        CLAUDE_CONFIG_DIR: CONFIG,
        CCSAVER_HOME: HOME,
        CLAUDE_CODE_EXECPATH: FAKE,
        PATH: SHELL_PATH,
      },
      typed,
    )
  const declined = await ask("n\n")
  assert.match(declined.stdout, /fix: ccsaver launcher write\r\nrun it\? \[y\/N\] /)
  assert.match(declined.stdout, /skipped/)
  assert.equal(existsSync(join(home, ".local", "bin", "ccsaver")), false)
  const accepted = await ask("y\n")
  assert.match(accepted.stdout, /launcher written to \S+pty-home\/\.local\/bin\/ccsaver/)
  assert.equal(existsSync(join(home, ".local", "bin", "ccsaver")), true)
})
