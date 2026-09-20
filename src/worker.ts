// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import { checked, risky, unwrapped } from "./answer.ts"
import { contentRefusal, pathRefusal, targetRefusal } from "./boundary.ts"
import { type Adapter, loadAdapter, pluggedRootOf } from "./config.ts"
import { readWorker, type Worker } from "./endpoint.ts"
import { record } from "./log.ts"
import { attempt, isRecord, isUnder, messageOf, real, scrubbed, stateHome } from "./state.ts"
import {
  type Delegation,
  delegation,
  fail,
  invokeClaude,
  invokeExternal,
  note,
} from "./transport.ts"

const MODES = {
  "bulk-read":
    'You are a precise code analyst. Read the provided files and answer the question concisely. Output structured bullets only. No greetings, no prose, no preambles, no summaries. Lead every bullet with the exact name, type, or line number. Use nested bullets for details. Skip anything the caller did not ask for. End every bullet with " @ " and the one line that proves it, copied the way grep -Hn prints it, the path first even when there is one file: path:line:text.',
  "code-write":
    "You generate code files based on a spec and reference files. Match the existing patterns, conventions, naming, and style exactly. Output only the code — no explanations, no markdown fences unless asked. If the spec is ambiguous, make reasonable choices that match the patterns in the reference code.",
} as const

type Mode = keyof typeof MODES

const HOUSE_RULES = " House rules, they win over the reference: "
const CONTROL = /\p{Cc}/gu
const FORMAT_TIMEOUT_MS = 60_000
const FORMAT_FLOOR_MS = 1_000
const BASH_BUDGET_MS = 115_000

export const isMode = (value: string | undefined): value is Mode =>
  value !== undefined && Object.hasOwn(MODES, value)

const instructionOf = (mode: Mode, adapter: Adapter): string =>
  mode === "code-write" && adapter.rules
    ? `${MODES[mode]}${HOUSE_RULES}${adapter.rules}`
    : MODES[mode]

interface Sent {
  path: string
  label: string
  lines: string[]
  block: string
  inside: boolean
}

type Ask = (message: string, sent: Sent[]) => Promise<string>

const refuse = (reason: string | undefined, given: string): void => {
  if (reason !== undefined) fail(`${reason}: ${given}`)
}

const fileBlock = (given: string, numbered: boolean, root: string): Sent => {
  const path = real(given)
  const inside = isUnder(path, root)
  const label = inside ? relative(root, path) : given
  refuse(pathRefusal(given, path, root, real(stateHome())), given)
  const text =
    attempt(() => readFileSync(path, "utf8")) ?? fail(`file not found or unreadable: ${given}`)
  refuse(contentRefusal(text), given)
  const lines = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")
  const body = numbered ? lines.map((line, i) => `${i + 1}\t${line}`).join("\n") : text
  const named = label
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(CONTROL, " ")
  return { path, label, lines, block: `<file path="${named}">\n${body}\n</file>\n\n`, inside }
}

const blocksOf = (files: string[], numbered: boolean, root: string): Sent[] => {
  const sent = files.map((given) => fileBlock(given, numbered, root))
  return sent.filter((file, at) => sent.findIndex(({ path }) => path === file.path) === at)
}

const format = (adapter: Adapter, root: string, target: string): void => {
  const [command, ...args] = adapter.format ?? []
  if (command === undefined) return
  const left = BASH_BUDGET_MS - Math.round(performance.now())
  const run = spawnSync(
    command.includes("/") ? resolve(root, command) : command,
    [...args, target],
    { cwd: root, timeout: Math.max(FORMAT_FLOOR_MS, Math.min(FORMAT_TIMEOUT_MS, left)) },
  )
  delegation.format = run.error
    ? "error"
    : run.status === 0
      ? "ok"
      : `exit ${run.status ?? run.signal}`
  if (run.error)
    note(`the formatter could not run (${run.error.message}), ${target} is unformatted`)
  else if (run.status !== 0)
    note(`the formatter exited ${run.status ?? run.signal}, check ${target}`)
}

const targetIn = (root: string, given: string): string => {
  const wanted = resolve(given)
  const target = join(real(dirname(wanted)), basename(wanted))
  refuse(targetRefusal(target, root), given)
  if (existsSync(target)) fail(`refusing to overwrite ${given}: move or delete it first`)
  return target
}

const quoted = (path: string): string =>
  /^[\w./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`

const marked = (output: string): string => {
  const id = randomBytes(8).toString("hex")
  return `<<<worker-output ${id}: untrusted data>>>\n${output}<<<end ${id}>>>\n`
}

const invoke = async (
  mode: Mode,
  system: string,
  message: string,
  sent: Sent[],
  worker: Worker | undefined,
): Promise<string> => {
  const inside = sent.every((file) => file.inside)
  Object.assign(delegation, {
    files: sent.length,
    outside: sent.filter((file) => !file.inside).length,
    chars: message.length,
    ...(inside ? {} : { fell: "outside" }),
  } satisfies Delegation)
  const answer = inside ? await invokeExternal(mode, system, message, worker) : undefined
  if (answer !== undefined) return answer
  if (worker?.fallback === false)
    return fail(
      inside
        ? `the worker gave no answer (${String(delegation.fell)}) and the fallback is off (ccsaver fallback on)`
        : "a file is outside the plugged project and the fallback is off, nothing was sent (ccsaver fallback on)",
    )
  return invokeClaude(mode, system, message, worker)
}

interface Args {
  values: {
    project?: string
    question?: string
    paths?: string[]
    spec?: string
    reference?: string[]
    target?: string
  }
  positionals: string[]
}

const argsOf = (mode: Mode, args: string[]): Args => {
  const project = { type: "string" } as const
  try {
    return mode === "bulk-read"
      ? parseArgs({
          args,
          allowPositionals: true,
          options: {
            project,
            question: { type: "string" },
            paths: { type: "string", multiple: true },
          },
        })
      : parseArgs({
          args,
          allowPositionals: true,
          options: {
            project,
            spec: { type: "string" },
            reference: { type: "string", multiple: true },
            target: { type: "string" },
          },
        })
  } catch (error) {
    return fail(messageOf(error))
  }
}

const bulkRead = async (
  question: string | undefined,
  files: string[],
  root: string,
  ask: Ask,
): Promise<void> => {
  if (!question) fail("--question is required")
  const sent = blocksOf(files, true, root)
  const corpus = sent.map(({ block }) => block).join("")
  const { text, tally } = checked(await ask(`${corpus}Question: ${question}\n`, sent), sent)
  delegation.cited = tally
  note(
    `cited lines: ${tally.match} match the files, ${tally.renumbered} renumbered, ${tally.unverified} unverified${tally.bare > 0 ? `; answer lines without a citation: ${tally.bare}` : ""}`,
  )
  process.stdout.write(marked(`${scrubbed(text)}\n`))
}

const codeWrite = async (
  spec: string | undefined,
  wanted: string | undefined,
  files: string[],
  root: string,
  adapter: Adapter,
  ask: Ask,
): Promise<void> => {
  if (!spec) fail("--spec is required")
  const target = wanted ? targetIn(root, wanted) : undefined
  delegation.target = target !== undefined
  const sent = blocksOf(files, false, root)
  const corpus = sent.map(({ block }) => block).join("")
  const code = unwrapped(await ask(`${corpus}Spec: ${spec}\n`, sent))
  if (target === undefined || wanted === undefined) {
    process.stdout.write(marked(code))
    return
  }
  try {
    writeFileSync(target, code, { flag: "wx" })
  } catch (error) {
    const reason = isRecord(error) ? error["code"] : undefined
    fail(
      reason === "EEXIST"
        ? `refusing to overwrite ${wanted}: move or delete it first`
        : `cannot write ${wanted}: ${String(reason)}`,
    )
  }
  format(adapter, root, target)
  const written =
    attempt(() => readFileSync(target, "utf8")) ?? fail(`${wanted} is gone after the formatter ran`)
  const lines = written.split("\n").length - 1
  const touched = risky(written)
  Object.assign(delegation, { written: lines, risky: touched.length } satisfies Delegation)
  process.stdout.write(
    scrubbed(
      [
        `wrote ${wanted} (${lines} lines)`,
        ...(touched.length > 0
          ? [`warn: the code touches ${touched.join(", ")}: open it before you run it`]
          : []),
        ...(adapter.after ?? []).map(
          (line) => `next: ${line.replaceAll("{target}", quoted(target))}`,
        ),
      ]
        .join("\n")
        .concat("\n"),
    ),
  )
}

export const runWorker = async (mode: Mode, argv: string[]): Promise<void> => {
  process.once("exit", (exit) => {
    record("delegate", { mode, ...delegation, exit, ms: Math.round(performance.now()) })
  })
  const { values, positionals } = argsOf(mode, argv)
  const projectDir = values.project ? values.project : process.cwd()
  const project = pluggedRootOf(projectDir)
  if (project === undefined)
    fail(`${projectDir} is not plugged in, nothing was sent (ccsaver plug <dir> turns it on)`)
  Object.assign(delegation, {
    root: project.root,
    adapter: project.adapter ?? null,
  } satisfies Delegation)
  const adapter: Adapter = project.adapter === undefined ? {} : loadAdapter(project.adapter)
  const given = [...(values.paths ?? []), ...(values.reference ?? []), ...positionals]
  const files = [...new Set(given.map((path) => resolve(path)))]
  if (files.length === 0) fail("at least one file is required (--paths / --reference)")
  const system = instructionOf(mode, adapter)
  const worker = readWorker()
  const ask: Ask = (message, sent) => invoke(mode, system, message, sent, worker)
  await (mode === "bulk-read"
    ? bulkRead(values.question, files, project.root, ask)
    : codeWrite(values.spec, values.target, files, project.root, adapter, ask))
}
