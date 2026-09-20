import assert from "node:assert/strict"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, test } from "node:test"
import {
  between,
  CLI,
  type FakeServer,
  fakeClaude,
  type Ran,
  run,
  startServer,
  systemOf,
  tempDir,
  writeHome,
} from "./helpers.ts"

const PINNED =
  "You generate code files based on a spec and reference files. Match the existing patterns, conventions, naming, and style exactly. Output only the code — no explanations, no markdown fences unless asked. If the spec is ambiguous, make reasonable choices that match the patterns in the reference code. House rules, they win over the reference: no comments of any kind; every function is an arrow const with an explicit return type, never the function keyword; no any; no non-null assertion (!); no type assertion (as) other than as const; relative imports carry the real file extension."

const HOME = tempDir("code-write-home")
const WORK = tempDir("code-write-work")
const OUTSIDE = tempDir("code-write-outside")
const PROJECT = join(WORK, "project")
const STYLED = join(WORK, "styled")
const FORMATTED = join(WORK, "formatted")
const UNFORMATTED = join(WORK, "unformatted")
const FAKE = fakeClaude(WORK)
const PLUGGED = [[PROJECT], [STYLED, "strict-ts"], [FORMATTED, "fmt"], [UNFORMATTED, "nofmt"]]

let server: FakeServer

const cli = (args: string[], env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run("node", [CLI, ...args], { CCSAVER_HOME: HOME, CLAUDE_CODE_EXECPATH: FAKE, ...env })

const codeWrite = (project: string, target?: string, env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  cli(
    [
      "code-write",
      "--project",
      project,
      "--spec",
      "s",
      "--reference",
      join(project, "source.ts"),
      ...(target === undefined ? [] : ["--target", target]),
    ],
    env,
  )

before(async () => {
  server = await startServer()
  const tools = join(FORMATTED, "tools")
  for (const dir of [PROJECT, STYLED, UNFORMATTED, tools, join(HOME, "adapters")])
    mkdirSync(dir, { recursive: true })
  for (const dir of [PROJECT, STYLED, FORMATTED, UNFORMATTED])
    writeFileSync(join(dir, "source.ts"), "export const a = 1\nexport const b = 2\n")
  writeFileSync(
    join(tools, "fmt.sh"),
    '#!/bin/sh\n[ -z "$FMT_RM" ] || exec rm "$1"\nprintf "export const formatted = 1\\n" >> "$1"\nexit $FMT_EXIT\n',
  )
  chmodSync(join(tools, "fmt.sh"), 0o755)
  writeFileSync(
    join(HOME, "adapters", "fmt.json"),
    JSON.stringify({ format: ["tools/fmt.sh"], after: ["check {target}", "then test"] }),
  )
  writeFileSync(
    join(HOME, "adapters", "nofmt.json"),
    JSON.stringify({ format: ["tools/missing.sh"] }),
  )
  writeFileSync(
    join(HOME, "adapters", "escapes.json"),
    JSON.stringify({ format: ["../outside-fmt.sh"] }),
  )
  writeHome(HOME, {
    plugged: PLUGGED,
    worker: { url: server.url, model: "cheap-1" },
    key: "k-test",
  })
})

beforeEach(() => {
  server.reset()
})

after(() => {
  server.close()
  for (const dir of [HOME, WORK, OUTSIDE]) rmSync(dir, { recursive: true, force: true })
})

test("code-write strips the markdown fence, writes the target and never overwrites", async () => {
  server.reply.content = "```ts\nexport const c = 3\n```"
  const target = join(PROJECT, "out.ts")
  const out = await codeWrite(PROJECT, target)
  assert.equal(out.code, 0)
  assert.equal(out.stdout, `wrote ${target} (1 lines)\n`)
  assert.equal(readFileSync(target, "utf8"), "export const c = 3\n")
  const sent = server.seen.length
  const again = await codeWrite(PROJECT, target)
  assert.equal(again.code, 1)
  assert.match(again.stderr, /refusing to overwrite/)
  assert.equal(server.seen.length, sent)
  assert.equal(between((await codeWrite(PROJECT)).stdout), "export const c = 3\n")
})

test("strips an echoed file wrapper", async () => {
  server.reply.content = '<file path="/x/out.ts">\n\nexport const d = 4\n</file>'
  const target = join(PROJECT, "wrapped.ts")
  await codeWrite(PROJECT, target)
  assert.equal(readFileSync(target, "utf8"), "export const d = 4\n")
})

test("formats with the adapter and lists its follow-up commands", async () => {
  server.reply.content = "export const e = 5\n"
  const target = join(FORMATTED, "made.ts")
  const out = await codeWrite(FORMATTED, target)
  assert.equal(readFileSync(target, "utf8"), "export const e = 5\nexport const formatted = 1\n")
  assert.equal(out.stdout, `wrote ${target} (2 lines)\nnext: check ${target}\nnext: then test\n`)
})

test("says so when the formatter of the adapter cannot run", async () => {
  server.reply.content = "export const f = 6\n"
  const target = join(UNFORMATTED, "made.ts")
  const out = await codeWrite(UNFORMATTED, target)
  assert.equal(out.code, 0)
  assert.match(out.stderr, /the formatter could not run/)
  assert.equal(readFileSync(target, "utf8"), "export const f = 6\n")
})

test("says so when the formatter exits with an error, and quotes a target that needs it", async () => {
  server.reply.content = "export const g = 7\n"
  const target = join(FORMATTED, "with space.ts")
  const out = await codeWrite(FORMATTED, target, { FMT_EXIT: "3" })
  assert.equal(out.code, 0)
  assert.match(out.stderr, /the formatter exited 3/)
  assert.ok(out.stdout.includes(`next: check '${target}'\n`), out.stdout)
})

test("a formatter that climbs out of the project is not run", async () => {
  const project = join(WORK, "escapes")
  mkdirSync(project, { recursive: true })
  writeFileSync(join(project, "source.ts"), "export const a = 1\n")
  const ran = join(WORK, "formatter-ran")
  writeFileSync(join(WORK, "outside-fmt.sh"), `#!/bin/sh\nprintf ran > ${ran}\n`)
  chmodSync(join(WORK, "outside-fmt.sh"), 0o755)
  await cli(["plug", project, "escapes"])
  server.reply.content = "export const i = 9\n"
  const target = join(project, "made.ts")
  const out = await codeWrite(project, target)
  assert.equal(out.code, 0)
  assert.match(
    out.stderr,
    /the formatter \.\.\/outside-fmt\.sh is outside .*escapes, .*made\.ts is unformatted/,
  )
  assert.equal(readFileSync(target, "utf8"), "export const i = 9\n")
  assert.equal(existsSync(ran), false)
})

test("fails instead of reporting a file the formatter took away", async () => {
  server.reply.content = "export const h = 8\n"
  const target = join(FORMATTED, "vanished.ts")
  const out = await codeWrite(FORMATTED, target, { FMT_RM: "1" })
  assert.equal(out.code, 1)
  assert.equal(out.stdout, "")
  assert.match(out.stderr, /^Error: .*vanished\.ts is gone after the formatter ran$/m)
})

test("warns before a follow-up command when the generated code reaches outside a test", async () => {
  server.reply.content =
    'import { execSync } from "node:child_process"\nexecSync("echo " + process.env.HOME)\n'
  const target = join(FORMATTED, "reaches-out.ts")
  const out = await codeWrite(FORMATTED, target)
  assert.deepEqual(out.stdout.split("\n").slice(0, 3), [
    `wrote ${target} (3 lines)`,
    "warn: the code touches child_process, process.env: open it before you run it",
    `next: check ${target}`,
  ])
})

test("refuses a target outside the plugged root or where Claude Code protects writes", async () => {
  const before = server.seen.length
  mkdirSync(join(PROJECT, ".claude"), { recursive: true })
  symlinkSync(OUTSIDE, join(PROJECT, "way-out"))
  for (const target of [
    join(OUTSIDE, "escaped.ts"),
    join(PROJECT, "way-out", "escaped.ts"),
    join(PROJECT, ".claude", "settings.json"),
    join(PROJECT, ".Git", "hooks", "pre-commit"),
    join(PROJECT, ".envrc"),
  ]) {
    const out = await codeWrite(PROJECT, target)
    assert.equal(out.code, 1, target)
    assert.match(out.stderr, /^Error: refusing to write /)
    assert.equal(existsSync(target), false)
  }
  assert.equal(server.seen.length, before)
})

test("keeps a closing fence that belongs to the generated file", async () => {
  server.reply.content = "# Title\n\n```bash\nls\n```"
  assert.equal(between((await codeWrite(PROJECT)).stdout), "# Title\n\n```bash\nls\n```\n")
})

test("the adapter rules complete the measured code-write instruction, byte for byte", async () => {
  await codeWrite(STYLED)
  assert.equal(PINNED.length, 584)
  assert.equal(systemOf(server), PINNED)
  await codeWrite(PROJECT)
  assert.equal(systemOf(server), PINNED.slice(0, 299))
})

test("refuses the options of the other mode instead of running and saying nothing", async () => {
  const strayed = await cli([
    "code-write",
    "--project",
    PROJECT,
    "--spec=s",
    "--question",
    "q",
    "--reference",
    join(PROJECT, "source.ts"),
  ])
  assert.deepEqual([strayed.code, strayed.stdout], [1, ""])
  assert.match(strayed.stderr, /^Error: Unknown option .--question./)
})

test("names the real reason when the target cannot be written", async () => {
  server.reply.content = "export const c = 3\n"
  const out = await codeWrite(PROJECT, join(PROJECT, "missing", "out.ts"))
  assert.equal(out.code, 1)
  assert.match(out.stderr, /ENOENT/)
})

test("a control character in the target cannot repaint the terminal", async () => {
  server.reply.content = "export const wiped = 1\n"
  const target = join(PROJECT, "made\u001b[2J.ts")
  const out = await codeWrite(PROJECT, target)
  assert.equal(out.code, 0)
  assert.equal(`${out.stdout}${out.stderr}`.includes("\u001b"), false)
  assert.match(out.stdout, /^wrote .*made\\x1b\[2J\.ts \(1 lines\)\n$/)
  assert.equal(readFileSync(target, "utf8"), "export const wiped = 1\n")
})

test("a symlink already at the target is refused before anything is sent, wherever it points", async () => {
  const before = server.seen.length
  const planted = join(OUTSIDE, "planted.ts")
  const target = join(PROJECT, "dangling.ts")
  symlinkSync(planted, target)
  const out = await codeWrite(PROJECT, target)
  assert.equal(out.code, 1)
  assert.match(
    out.stderr,
    /^Error: refusing to overwrite .*dangling\.ts: move or delete it first$/m,
  )
  assert.deepEqual([existsSync(planted), server.seen.length], [false, before])
})

test("a target that climbs out through .. or names a folder is refused, and nothing is sent", async () => {
  const before = server.seen.length
  const climbed = await codeWrite(PROJECT, `${PROJECT}/src/../../escaped.ts`)
  assert.equal(climbed.code, 1)
  assert.match(climbed.stderr, /^Error: refusing to write outside the plugged project/)
  const folder = await codeWrite(PROJECT, PROJECT)
  assert.equal(folder.code, 1)
  assert.match(folder.stderr, /^Error: refusing to overwrite /)
  assert.deepEqual([existsSync(join(WORK, "escaped.ts")), server.seen.length], [false, before])
})
