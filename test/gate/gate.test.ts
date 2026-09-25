import assert from "node:assert/strict"
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import {
  AS_ROOT,
  GATE,
  HANDOFF,
  HOOK,
  pdfOf,
  type Ran,
  run,
  tempDir,
  writeHome,
} from "../test.helpers.ts"

const HOME = tempDir("gate-home")
const OFF_HOME = tempDir("gate-off")
const ON_HOME = tempDir("gate-on")
const NESTED_HOME = tempDir("gate-nested")
const COMPACT_HOME = tempDir("gate-compact")
const EMPTY_HOME = tempDir("gate-empty")
const WORK = tempDir("gate-work")
const PLUGGED = join(WORK, "proj-a")
const DEEP = join(PLUGGED, "deep", "er")
const SIBLING = join(WORK, "proj-ab")
const OTHER = join(WORK, "other")
const LONG = join(PLUGGED, "long.txt")
const SMALL = join(PLUGGED, "small.txt")
const PARTIAL = join(PLUGGED, "partial.txt")
const EDGE = join(PLUGGED, "edge.txt")
const AT_BYTES = join(PLUGGED, "at-bytes.txt")
const PAST_BYTES = join(PLUGGED, "past-bytes.txt")
const BRACED = join(PLUGGED, "brace}.txt")
const PDF = join(PLUGGED, "spec.pdf")
const FAKE_BIN = join(WORK, "bin")
const MARKER = join(WORK, "node-was-launched")
const INPUT = JSON.stringify({ tool_input: { file_path: LONG } })
const ROW = `${"x".repeat(99)}\n`

for (const dir of [DEEP, SIBLING, OTHER, FAKE_BIN]) mkdirSync(dir, { recursive: true })
writeFileSync(LONG, "x\n".repeat(351))
writeFileSync(SMALL, "x\n".repeat(100))
writeFileSync(PARTIAL, `${"x\n".repeat(349)}x`)
writeFileSync(EDGE, "x\n".repeat(350))
writeFileSync(AT_BYTES, ROW.repeat(320))
writeFileSync(PAST_BYTES, `${ROW.repeat(320)}x`)
writeFileSync(BRACED, "x\n".repeat(100))
writeFileSync(PDF, pdfOf(1200))
writeFileSync(join(FAKE_BIN, "node"), `#!/bin/sh\n: > "${MARKER}"\n`)
chmodSync(join(FAKE_BIN, "node"), 0o755)
writeHome(HOME, { plugged: [["", "strict-ts"], [join(WORK, "unrelated")], [PLUGGED, "strict-ts"]] })
writeHome(OFF_HOME, { plugged: [[PLUGGED]] })
writeHome(ON_HOME, { plugged: [[PLUGGED]] })
mkdirSync(join(ON_HOME, "log"), { mode: 0o700 })
writeHome(NESTED_HOME, { plugged: [[PLUGGED], [DEEP, "strict-ts"]] })
writeHome(COMPACT_HOME, { plugged: [[PLUGGED]] })
writeFileSync(join(COMPACT_HOME, "handoff.json"), '{"on":false,"limit":200000}\n', { mode: 0o600 })
writeFileSync(
  join(OFF_HOME, "handoff.json"),
  `${JSON.stringify({ on: false, limit: 200_000 }, null, 2)}\n`,
  { mode: 0o600 },
)

const gate = (project: string, env: NodeJS.ProcessEnv = {}): Promise<Ran> =>
  run("sh", [GATE, "read-gate"], { CCSAVER_HOME: HOME, CLAUDE_PROJECT_DIR: project, ...env }, INPUT)

const read = (file_path: string, range: Record<string, unknown> = {}): string =>
  JSON.stringify({ session_id: "s", tool_input: { file_path, ...range } })

const asked = (
  input: string,
  home: string,
  env: NodeJS.ProcessEnv = {},
  project = PLUGGED,
  hook = "read-gate",
): Promise<Ran> =>
  run("sh", [GATE, hook], { CCSAVER_HOME: home, CLAUDE_PROJECT_DIR: project, ...env }, input)

const nodeStarted = async (
  input: string,
  home = OFF_HOME,
  project = PLUGGED,
  hook = "read-gate",
): Promise<boolean> => {
  rmSync(MARKER, { force: true })
  const path = `${FAKE_BIN}:${process.env["PATH"] ?? ""}`
  const out = await asked(input, home, { PATH: path }, project, hook)
  assert.deepEqual([out.code, out.stdout, out.stderr], [0, "", ""], input)
  return existsSync(MARKER)
}

const SH_DECIDES = [
  read(SMALL),
  read(PARTIAL),
  read(AT_BYTES),
  read(LONG, { offset: 10 }),
  read(LONG, { limit: 5 }),
  read(SMALL, { offset: 1, limit: 5 }),
  read(PDF, { pages: "1-2" }),
]

const NODE_DECIDES = [
  read(LONG),
  read(EDGE),
  read(PAST_BYTES),
  read(BRACED),
  read(PDF),
  read(LONG, { offset: null, limit: null }),
  read(`${SMALL}\\`),
  `{"tool_input": {"file_path":"${SMALL}"}}`,
  read("small.txt"),
  read(PLUGGED),
  read(join(PLUGGED, "missing.txt")),
  JSON.stringify({ tool_input: "nope" }),
]

const HANDOFF_HOME = join(WORK, "handoff-home")
const ASKED_HOME = join(WORK, "asked-home")
const LIMIT_HOME = join(WORK, "limit-home")
const HIGH_HOME = join(WORK, "high-home")
const SHUT_HOME = join(WORK, "shut-home")
const TRANSCRIPT = join(WORK, "transcript.jsonl")

for (const home of [HANDOFF_HOME, ASKED_HOME, LIMIT_HOME, HIGH_HOME, SHUT_HOME])
  writeHome(home, { plugged: [[PLUGGED]] })
mkdirSync(join(ASKED_HOME, "handoff"), { mode: 0o700 })
writeFileSync(join(ASKED_HOME, "handoff", "s.asked"), "1\n")
writeFileSync(
  join(LIMIT_HOME, "handoff.json"),
  `${JSON.stringify({ on: true, limit: 150_000 }, null, 2)}\n`,
)
writeFileSync(
  join(HIGH_HOME, "handoff.json"),
  `${JSON.stringify({ on: true, limit: 300_000 }, null, 2)}\n`,
)
writeFileSync(join(SHUT_HOME, "handoff.json"), "{}", { mode: 0o000 })

const spoken = (context: number, block: object, index: number, stop = "tool_use"): string =>
  JSON.stringify({
    type: "assistant",
    isSidechain: false,
    apiBlockIndex: index,
    requestId: "req",
    timestamp: new Date().toISOString(),
    message: {
      role: "assistant",
      model: "claude-fable-5-1",
      id: "req",
      content: [block],
      stop_reason: stop,
      usage: {
        input_tokens: 2,
        cache_creation_input_tokens: 1_000,
        cache_read_input_tokens: context - 1_002,
        output_tokens: 10,
      },
    },
  })

writeFileSync(
  TRANSCRIPT,
  `${[
    JSON.stringify({ type: "user", message: { role: "user", content: "x" } }),
    spoken(100_000, { type: "thinking", thinking: "t" }, 0),
    spoken(100_000, { type: "text", text: "x" }, 1),
    spoken(100_000, { type: "tool_use", id: "toolu_a", name: "Bash", input: {} }, 2),
    spoken(100_000, { type: "tool_use", id: "toolu_b", name: "Bash", input: {} }, 3),
  ].join("\n")}\n`,
)

const handoffInput = (rest: object): string =>
  JSON.stringify({
    session_id: "s",
    transcript_path: TRANSCRIPT,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    ...rest,
  })

const CUT_TRANSCRIPT = join(WORK, "cut.jsonl")
const SYNTHETIC_TRANSCRIPT = join(WORK, "synthetic.jsonl")
writeFileSync(
  CUT_TRANSCRIPT,
  `${readFileSync(TRANSCRIPT, "utf8")}${spoken(100_000, { type: "text", text: "cut" }, 4).slice(0, -40)}`,
)
writeFileSync(
  SYNTHETIC_TRANSCRIPT,
  `${readFileSync(TRANSCRIPT, "utf8")}${JSON.stringify({
    type: "assistant",
    isSidechain: false,
    message: { role: "assistant", model: "<synthetic>", content: [], usage: { input_tokens: 0 } },
  })}\n`,
)

const prompted = (transcript_path: string): string =>
  handoffInput({ hook_event_name: "UserPromptSubmit", prompt: "x", transcript_path })

const SH_HANDOFF = [
  handoffInput({ tool_use_id: "toolu_a" }),
  handoffInput({
    tool_use_id: "toolu_a",
    tool_input: {
      command: "ls",
      session_id: "other",
      transcript_path: "/nope/x.jsonl",
      hook_event_name: "Stop",
      tool_use_id: "toolu_zzz",
    },
  }),
  prompted(TRANSCRIPT),
  handoffInput({ tool_use_id: "toolu_b", agent_id: "agent-1" }),
]

const NODE_HANDOFF = [
  handoffInput({ tool_use_id: "toolu_b" }),
  prompted(CUT_TRANSCRIPT),
  prompted(SYNTHETIC_TRANSCRIPT),
  handoffInput({ tool_use_id: "toolu_a", session_id: "s/x" }),
  handoffInput({ tool_use_id: "toolu_a", transcript_path: `${TRANSCRIPT}\\` }),
  handoffInput({ tool_use_id: "toolu_a", transcript_path: "relative.jsonl" }),
  handoffInput({ tool_use_id: "toolu_a", transcript_path: join(WORK, "gone.jsonl") }),
  JSON.stringify({
    hook_event_name: "PreToolUse",
    tool_use_id: "toolu_a",
    transcript_path: TRANSCRIPT,
  }),
]

after(() => {
  for (const dir of [HOME, OFF_HOME, ON_HOME, NESTED_HOME, COMPACT_HOME, EMPTY_HOME, WORK])
    rmSync(dir, { recursive: true, force: true })
})

test("a plugged project is denied, and the hook input reaches node through the gate", async () => {
  const out = await gate(PLUGGED, { NODE_COMPILE_CACHE: "" })
  assert.equal(out.code, 0)
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  assert.ok(out.stdout.includes(LONG))
  assert.equal(existsSync(join(HOME, "cache")), true)
})

test("node compiles into the cache the environment names, and into the state folder only without one", async () => {
  const shared = join(WORK, "shared-cache")
  const out = await asked(read(LONG), ON_HOME, { NODE_COMPILE_CACHE: shared })
  assert.match(out.stdout, /"permissionDecision":"deny"/)
  assert.deepEqual([existsSync(shared), existsSync(join(ON_HOME, "cache"))], [true, false])
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

test("with the log off and no adapter, the sh gate lets a small file and a ranged read through without starting node", async () => {
  for (const input of SH_DECIDES) assert.equal(await nodeStarted(input), false, input)
})

test("the sh gate hands node every read it is not sure of, and every read under an adapter or with the log on", async () => {
  for (const input of NODE_DECIDES) assert.equal(await nodeStarted(input), true, input)
  assert.equal(await nodeStarted(read(SMALL), HOME), true)
  assert.equal(await nodeStarted(read(SMALL), ON_HOME), true)
  assert.equal(await nodeStarted(read(join(DEEP, "small.txt")), NESTED_HOME, DEEP), true)
  assert.equal(await nodeStarted(read(SMALL), NESTED_HOME), false)
})

test("the sh gate and the node hook answer every read the same, the input reaching node whole", async () => {
  const env = { CCSAVER_HOME: OFF_HOME, CLAUDE_PROJECT_DIR: PLUGGED }
  for (const input of [...SH_DECIDES, ...NODE_DECIDES]) {
    const [sh, node] = await Promise.all([asked(input, OFF_HOME), run("node", [HOOK], env, input)])
    assert.deepEqual([sh.code, sh.stdout, sh.stderr], [node.code, node.stdout, node.stderr], input)
  }
  const denied = await asked(read(LONG), OFF_HOME)
  assert.match(denied.stdout, /"permissionDecision":"deny"/)
  assert.ok(denied.stdout.includes(LONG))
  assert.equal((await asked(read(PAST_BYTES), OFF_HOME)).stdout.includes("32001 bytes"), true)
})

test("the handoff hook is launched in a plugged project unless the warning is off, never in an unplugged one, and never without a name", async () => {
  const path = `${FAKE_BIN}:${process.env["PATH"] ?? ""}`
  const launch = (project: string, home: string, args = [GATE, "handoff"]): Promise<Ran> =>
    run("sh", args, { CCSAVER_HOME: home, CLAUDE_PROJECT_DIR: project, PATH: path }, "{}")
  rmSync(MARKER, { force: true })
  await launch(OTHER, HOME)
  assert.equal(existsSync(MARKER), false)
  await launch(PLUGGED, OFF_HOME)
  assert.equal(existsSync(MARKER), false)
  await launch(PLUGGED, COMPACT_HOME)
  assert.equal(existsSync(MARKER), false)
  assert.deepEqual(await launch(PLUGGED, HOME, [GATE]), { code: 0, stdout: "", stderr: "" })
  assert.equal(existsSync(MARKER), false)
  await launch(PLUGGED, HOME)
  assert.equal(existsSync(MARKER), true)
})

test("the sh gate answers the handoff hook below the point without starting node, and hands node every event it is not sure of", async () => {
  for (const input of SH_HANDOFF)
    assert.equal(await nodeStarted(input, HANDOFF_HOME, PLUGGED, "handoff"), false, input)
  for (const input of NODE_HANDOFF)
    assert.equal(await nodeStarted(input, HANDOFF_HOME, PLUGGED, "handoff"), true, input)
  const ended = join(WORK, "ended.jsonl")
  writeFileSync(ended, `${spoken(100_000, { type: "text", text: "x" }, 0, "end_turn")}\n`)
  const stop = handoffInput({
    hook_event_name: "Stop",
    stop_hook_active: false,
    transcript_path: ended,
  })
  assert.equal(await nodeStarted(stop, HANDOFF_HOME, PLUGGED, "handoff"), true)
  assert.equal(await nodeStarted(SH_HANDOFF[0] ?? "", ASKED_HOME, PLUGGED, "handoff"), true)
  assert.equal(await nodeStarted(SH_HANDOFF[1] ?? "", LIMIT_HOME, PLUGGED, "handoff"), true)
  assert.equal(await nodeStarted(NODE_HANDOFF[0] ?? "", HIGH_HOME, PLUGGED, "handoff"), false)
  if (!AS_ROOT)
    assert.equal(await nodeStarted(SH_HANDOFF[0] ?? "", SHUT_HOME, PLUGGED, "handoff"), true)
})

test("the sh gate and the handoff hook answer every event the same", async () => {
  const env = { CCSAVER_HOME: HANDOFF_HOME, CLAUDE_PROJECT_DIR: PLUGGED }
  for (const input of [...SH_HANDOFF, ...NODE_HANDOFF]) {
    const [sh, node] = await Promise.all([
      asked(input, HANDOFF_HOME, {}, PLUGGED, "handoff"),
      run("node", [HANDOFF], env, input),
    ])
    assert.deepEqual([sh.code, sh.stdout, sh.stderr], [node.code, node.stdout, node.stderr], input)
  }
})
