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
import { dirname, join } from "node:path"
import { after, before, test } from "node:test"
import {
  events,
  fakeInstall,
  LAUNCHER,
  type Ran,
  REPO,
  run,
  SHELL_PATH,
  tempDir,
} from "../test.helpers.ts"

const HOME = tempDir("terminal-launcher-home")
const WORK = tempDir("terminal-launcher-work")
const USER_HOME = tempDir("terminal-launcher-user")
const CONFIG = tempDir("terminal-launcher-config")
const PLACE = join(USER_HOME, ".local", "bin", "ccsaver")
const BIN = dirname(PLACE)
const PROFILE_LINE = 'export PATH="$HOME/.local/bin:$PATH"'
const NOT_INSTALLED =
  "Error: ccsaver is not installed: claude plugin install ccsaver@abgonzalez93, or remove this launcher: rm -f ~/.local/bin/ccsaver\n"

let cache: string

const terminal = (args: string[], env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run(LAUNCHER, args, {
    HOME: USER_HOME,
    CLAUDE_CONFIG_DIR: CONFIG,
    CCSAVER_HOME: HOME,
    PATH: SHELL_PATH,
    ...env,
  })

const launched = (args: string[], env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run("/bin/sh", [PLACE, ...args], {
    HOME: USER_HOME,
    CLAUDE_CONFIG_DIR: CONFIG,
    PATH: SHELL_PATH,
    ...env,
  })

const configs = (): number => events(HOME).filter(({ kind }) => kind === "config").length

const registryOf = (label: string, text: string): string => {
  const config = join(WORK, label)
  mkdirSync(join(config, "plugins"), { recursive: true })
  writeFileSync(join(config, "plugins", "installed_plugins.json"), text)
  return config
}

before(() => {
  cache = fakeInstall(CONFIG, "0.21.0", ["0.21.0", "0.30.0"])
})

after(() => {
  for (const dir of [HOME, WORK, USER_HOME, CONFIG]) rmSync(dir, { recursive: true, force: true })
})

test("launcher write puts an executable launcher in ~/.local/bin, and names the PATH line when its folder is not on it", async () => {
  assert.equal((await run(LAUNCHER, ["log", "on"], { CCSAVER_HOME: HOME })).code, 0)
  const out = await terminal(["launcher", "write"])
  assert.equal(out.code, 0)
  assert.equal(out.stdout, `launcher written to ${PLACE}\nin a new terminal: ccsaver version\n`)
  assert.equal(
    out.stderr,
    `warn: ${BIN} is not on this PATH; add to your shell profile: ${PROFILE_LINE}\n`,
  )
  assert.equal(statSync(PLACE).mode & 0o777, 0o755)
  assert.match(readFileSync(PLACE, "utf8"), /^#!\/bin\/sh\n# ccsaver launcher 1 /)
  assert.deepEqual(
    events(HOME)
      .filter(({ action }) => action === "launcher")
      .map(({ place }) => place),
    [PLACE],
  )
})

test("written again it says already, touches nothing, records nothing, and its folder on the PATH ends the warning", async () => {
  const before = statSync(PLACE).mtimeMs
  const recorded = configs()
  const again = await terminal(["launcher", "write"], { PATH: `${BIN}:${SHELL_PATH}` })
  assert.deepEqual(
    [again.code, again.stdout, again.stderr],
    [0, `the launcher is already at ${PLACE}\n`, ""],
  )
  assert.equal(statSync(PLACE).mtimeMs, before)
  assert.equal(configs(), recorded)
})

test("a ccsaver of someone else's that comes first on the PATH is named", async () => {
  const elsewhere = join(WORK, "elsewhere")
  mkdirSync(elsewhere)
  writeFileSync(join(elsewhere, "ccsaver"), "#!/bin/sh\necho mine\n")
  chmodSync(join(elsewhere, "ccsaver"), 0o755)
  const out = await terminal(["launcher", "write"], { PATH: `${elsewhere}:${BIN}:${SHELL_PATH}` })
  assert.equal(out.code, 0)
  assert.equal(
    out.stderr,
    `warn: ${join(elsewhere, "ccsaver")} comes first on this PATH and is not ccsaver's launcher\n`,
  )
})

test("the launcher runs the installed version, never the newest folder in the cache", async () => {
  const out = await launched(["version"])
  assert.deepEqual([out.code, out.stdout, out.stderr], [0, "0.21.0\n", ""])
})

test("inside a session the bin of the plugin the session loaded wins, even last on the PATH", async () => {
  assert.equal(existsSync(PLACE), true)
  const session = `${BIN}:${SHELL_PATH}:${join(cache, "0.30.0", "bin")}`
  const out = await run("/bin/sh", ["-c", "ccsaver version"], {
    HOME: USER_HOME,
    CLAUDE_CONFIG_DIR: CONFIG,
    PATH: session,
  })
  assert.deepEqual([out.code, out.stdout], [0, "0.30.0\n"])
})

test("uninstalled, with its folder still in the cache, the launcher says so and runs nothing", async () => {
  const gone = registryOf("gone", '{"version": 2, "plugins": {}}')
  const out = await launched(["version"], { CLAUDE_CONFIG_DIR: gone })
  assert.deepEqual([out.code, out.stdout, out.stderr], [1, "", NOT_INSTALLED])
  const never = await launched(["version"], { CLAUDE_CONFIG_DIR: join(WORK, "never") })
  assert.equal(never.code, 1)
  assert.match(
    never.stderr,
    /^Error: ccsaver is not installed \(no \S+installed_plugins\.json\): claude plugin install/,
  )
})

test("a record it cannot read stops the launcher with the file's name, never read as not installed", async () => {
  const cases: [string, string, RegExp][] = [
    [
      "broken",
      "{ oops",
      /^Error: \S+installed_plugins\.json is not JSON, so this launcher cannot tell which ccsaver is installed\n$/,
    ],
    [
      "future",
      '{"version": 3, "plugins": {}}',
      /^Error: \S+installed_plugins\.json has a shape this launcher does not know: run ccsaver from a Claude Code session, and update ccsaver\n$/,
    ],
    [
      "pathless",
      '{"version": 2, "plugins": {"ccsaver@abgonzalez93": [{"scope": "user"}]}}',
      /^Error: \S+installed_plugins\.json: the ccsaver entry has no installPath this launcher knows\n$/,
    ],
  ]
  for (const [label, text, shape] of cases) {
    const out = await launched(["version"], { CLAUDE_CONFIG_DIR: registryOf(label, text) })
    assert.deepEqual([out.code, out.stdout], [1, ""], label)
    assert.match(out.stderr, shape, label)
  }
})

test("another marketplace name works, and a folder the sweep took is named", async () => {
  const other = join(WORK, "other-config")
  fakeInstall(other, "0.21.0", ["0.21.0"], "my-mk")
  const out = await launched(["version"], { CLAUDE_CONFIG_DIR: other })
  assert.deepEqual([out.code, out.stdout], [0, "0.21.0\n"])
  const swept = registryOf(
    "swept",
    '{"version": 2, "plugins": {"ccsaver@abgonzalez93": [{"scope": "user", "installPath": "/nonexistent/0.1.0"}]}}',
  )
  const gone = await launched(["version"], { CLAUDE_CONFIG_DIR: swept })
  assert.deepEqual(
    [gone.code, gone.stderr],
    [
      1,
      "Error: the installed ccsaver is gone from /nonexistent/0.1.0: claude plugin update ccsaver@abgonzalez93\n",
    ],
  )
})

test("without CLAUDE_CONFIG_DIR the record is read under ~/.claude", async () => {
  fakeInstall(join(USER_HOME, ".claude"), "0.21.0", ["0.21.0"])
  const out = await launched(["version"], { CLAUDE_CONFIG_DIR: "" })
  assert.deepEqual([out.code, out.stdout], [0, "0.21.0\n"])
})

test("a ccsaver of someone else's at that place is never replaced, and an older launcher of ccsaver's is", async () => {
  const home = join(WORK, "other-home")
  const place = join(home, ".local", "bin", "ccsaver")
  mkdirSync(dirname(place), { recursive: true })
  writeFileSync(place, "#!/bin/sh\necho mine\n")
  const kept = await terminal(["launcher", "write"], { HOME: home })
  assert.deepEqual(
    [kept.code, kept.stdout, kept.stderr],
    [
      1,
      "",
      `Error: ${place} is not ccsaver's launcher, nothing written: move it away, or keep using it\n`,
    ],
  )
  assert.equal(readFileSync(place, "utf8"), "#!/bin/sh\necho mine\n")
  writeFileSync(place, "#!/bin/sh\n# ccsaver launcher 0 · older\nexit 3\n")
  const replaced = await terminal(["launcher", "write"], { HOME: home })
  assert.equal(replaced.code, 0)
  assert.equal(
    replaced.stdout,
    `launcher replaced at ${place} (an older launcher of ccsaver's)\nin a new terminal: ccsaver version\n`,
  )
  assert.equal(readFileSync(place, "utf8"), readFileSync(PLACE, "utf8"))
})

test("the launcher is put together from its two pieces, and the JavaScript piece carries no single quote", async () => {
  const sh = readFileSync(join(REPO, "launcher", "ccsaver.sh"), "utf8")
  const js = readFileSync(join(REPO, "launcher", "installed.js"), "utf8")
  assert.equal(sh.split("__INSTALLED_JS__").length, 2)
  assert.equal(js.includes("'"), false)
  assert.equal(
    readFileSync(PLACE, "utf8"),
    sh.replace("__INSTALLED_JS__", () => js.trimEnd()),
  )
  const alone = await run(
    "node",
    [join(REPO, "launcher", "installed.js"), join(CONFIG, "plugins", "installed_plugins.json")],
    {},
  )
  assert.deepEqual([alone.code, alone.stdout, alone.stderr], [0, join(cache, "0.21.0"), ""])
})
