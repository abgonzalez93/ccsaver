import assert from "node:assert/strict"
import { readdirSync, rmSync } from "node:fs"
import { after, test } from "node:test"
import { CLI, LAUNCHER, type Ran, run, tempDir } from "../test.helpers.ts"

const HOME = tempDir("mistakes-home")

const ccsaver = (args: string[]): Promise<Ran> => run(LAUNCHER, args, { CCSAVER_HOME: HOME })

after(() => {
  rmSync(HOME, { recursive: true, force: true })
})

const MISTAKES: [string[], string, string][] = [
  [["doctor", "now"], "doctor takes no arguments, not 1: now", "ccsaver doctor   "],
  [["list", "extra"], "list takes no arguments, not 1: extra", "ccsaver list   "],
  [["version", "extra"], "version takes no arguments, not 1: extra", "ccsaver version   "],
  [["--version", "extra"], "--version takes no arguments, not 1: extra", "ccsaver version   "],
  [["plug", "a", "b", "c"], "plug takes at most 2 arguments, not 3: a b c", "ccsaver plug [dir]"],
  [
    ["unplug", "/tmp/x", "/tmp/y"],
    "unplug takes at most 1 argument, not 2: /tmp/x /tmp/y",
    "unplug <dir>",
  ],
  [["unplug"], "unplug needs the directory to unplug", "ccsaver unplug <dir>    "],
  [
    ["adapter"],
    "adapter needs a name, then maxLines=<n> or maxTokens=<n>",
    "ccsaver adapter <name> k=v",
  ],
  [["worker"], "worker needs set or claude", "ccsaver worker set <url> <model>"],
  [
    ["worker", "frob"],
    "worker takes set or claude, not: frob",
    "       ccsaver worker claude <path>|auto",
  ],
  [["worker", "set"], "worker set needs <url> <model>", "ccsaver worker set <url> <model>"],
  [["worker", "set", "https://h/v1"], "worker set needs <url> <model>", "ccsaver worker set"],
  [
    ["worker", "claude"],
    "worker claude needs a path, or auto",
    "ccsaver worker claude <path>|auto",
  ],
  [
    ["worker", "set", "https://h/v1", "m", "extra"],
    "worker takes at most 3 arguments, not 4: set https://h/v1 m extra",
    "ccsaver worker set",
  ],
  [["key"], "key needs set: ccsaver key set", "ccsaver key set   "],
  [["key", "get"], "key takes set, not: get", "ccsaver key set   "],
  [["key", "set", "extra"], "key takes at most 1 argument, not 2: set extra", "ccsaver key set   "],
  [["fallback"], "fallback needs on or off", "ccsaver fallback on|off"],
  [["fallback", "sideways"], "fallback takes on or off, not: sideways", "ccsaver fallback on|off"],
  [["log"], "log needs on or off", "ccsaver log on|off"],
  [["log", "on", "please"], "log takes at most 1 argument, not 2: on please", "ccsaver log on|off"],
  [
    ["saved", "2026-13"],
    "saved takes a month, YYYY-MM, or all; not: 2026-13",
    "ccsaver saved [month|all]",
  ],
  [
    ["saved", "all", "extra"],
    "saved takes at most 1 argument, not 2: all extra",
    "ccsaver saved [month|all]",
  ],
  [
    ["price", "claude-opus-5"],
    "price needs the dollars per million after claude-opus-5: ccsaver price claude-opus-5 <usd>",
    "ccsaver price <model>|worker <usd>",
  ],
  [
    ["price", "Bad Name", "5"],
    "a model name takes lowercase letters, digits, dots, dashes and underscores; not: Bad Name",
    "ccsaver price <model>|worker <usd>",
  ],
  [
    ["price", "claude-opus-5", "5", "9"],
    "price takes at most 2 arguments, not 3: claude-opus-5 5 9",
    "ccsaver price <model>|worker <usd>",
  ],
]

test("a mistake says what was wrong, then the row of its own command, never the whole table", async () => {
  const help = await ccsaver(["--help"])
  for (const [typed, complaint, row] of MISTAKES) {
    const out = await ccsaver(typed)
    const where = typed.join(" ")
    assert.deepEqual([out.code, out.stdout], [1, ""], where)
    assert.ok(
      out.stderr.startsWith(`Error: ${complaint}\nusage: ccsaver `),
      `${where}\n${out.stderr}`,
    )
    assert.ok(out.stderr.includes(row), `${where}\n${out.stderr}`)
    assert.equal(out.stderr.includes("\n  setup "), false, where)
    assert.ok(out.stderr.length < help.stdout.length, where)
  }
})

test("help goes to stdout and exits 0, and a word that is no command gets the whole table", async () => {
  const help = await ccsaver(["--help"])
  assert.deepEqual([help.code, help.stderr], [0, ""])
  assert.match(help.stdout, /^usage: ccsaver <command>\n\n {2}setup /)
  for (const spelling of [["-h"], ["help"], []])
    assert.equal((await ccsaver(spelling)).stdout, help.stdout, spelling.join(" "))
  const unknown = await ccsaver(["frobnicate"])
  assert.deepEqual([unknown.code, unknown.stdout], [1, ""])
  assert.equal(unknown.stderr, `Error: unknown command: frobnicate\n${help.stdout}`)
})

test("a second row of the same command comes under the first, indented to line up", async () => {
  const out = await ccsaver(["worker", "frob"])
  assert.equal(
    out.stderr,
    [
      "Error: worker takes set or claude, not: frob",
      "usage: ccsaver worker set <url> <model>   point at an OpenAI-compatible chat completions endpoint",
      "       ccsaver worker claude <path>|auto  pin the claude binary the fallback runs (auto: the session's own)",
      "",
    ].join("\n"),
  )
})

test("key set through node instead of the launcher is refused with the reason", async () => {
  const out = await run("node", [CLI, "key", "set"], { CCSAVER_HOME: HOME })
  assert.deepEqual([out.code, out.stdout], [1, ""])
  assert.ok(
    out.stderr.startsWith(
      "Error: key set belongs to the launcher: run ccsaver key set, not node src/ccsaver.cli.ts\nusage: ccsaver key set",
    ),
    out.stderr,
  )
})

test("a mistake writes nothing to the state folder", () => {
  assert.deepEqual(
    readdirSync(HOME).filter((name) => name !== "cache"),
    [],
  )
})
