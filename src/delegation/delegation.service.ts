// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { constants } from "node:buffer"
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { lstatSync, readFileSync, type Stats, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import { type Adapter, loadAdapter, pluggedRootOf } from "../state/config.store.ts"
import { record } from "../state/log.store.ts"
import {
  attempt,
  hidden,
  isRecord,
  isUnder,
  marked,
  messageOf,
  quoted,
  real,
  scrubbed,
  stateHome,
} from "../state/state.store.ts"
import { checked, risky, unwrapped } from "./answer.validator.ts"
import { contentRefusal, pathRefusal, targetRefusal } from "./boundary.guard.ts"
import {
  type Delegation,
  delegation,
  fail,
  invokeClaude,
  invokeExternal,
  note,
} from "./worker.client.ts"
import { readWorker, type Worker } from "./worker.store.ts"

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
const FORMAT_MAX_BYTES = 1024 * 1024
const FORMAT_SAID_CHARS = 400
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

const shapeRefusal = (stat: Stats): string | undefined => {
  if (!stat.isFile()) return "not a regular file"
  return stat.size > constants.MAX_STRING_LENGTH
    ? `too big to read in one call, ${stat.size} bytes where the most is ${constants.MAX_STRING_LENGTH}`
    : undefined
}

const fileBlock = (given: string, numbered: boolean, root: string): Sent => {
  const path = real(given)
  const inside = isUnder(path, root)
  const label = inside ? relative(root, path) : given
  refuse(pathRefusal(given, path, root, real(stateHome())), given)
  const stat = attempt(() => statSync(path))
  if (stat !== undefined) refuse(shapeRefusal(stat), given)
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

const saidOn = (stderr: string): string => {
  const said = stderr.trim().slice(0, FORMAT_SAID_CHARS)
  return said === "" ? "" : `: ${said}`
}

const format = (adapter: Adapter, root: string, target: string): void => {
  const [command, ...args] = adapter.format ?? []
  if (command === undefined) return
  const bin = command.includes("/") ? resolve(root, command) : command
  if (command.includes("/") && !isUnder(bin, root)) {
    delegation.format = "outside"
    note(`the formatter ${command} is outside ${root}, ${target} is unformatted`)
    return
  }
  const left = BASH_BUDGET_MS - Math.round(performance.now())
  const run = spawnSync(bin, [...args, target], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: FORMAT_MAX_BYTES,
    timeout: Math.max(FORMAT_FLOOR_MS, Math.min(FORMAT_TIMEOUT_MS, left)),
  })
  delegation.format = run.error
    ? "error"
    : run.status === 0
      ? "ok"
      : `exit ${run.status ?? run.signal}`
  if (run.error)
    note(`the formatter could not run (${run.error.message}), ${target} is unformatted`)
  else if (run.status !== 0)
    note(`the formatter exited ${run.status ?? run.signal}${saidOn(run.stderr)}, check ${target}`)
}

const targetIn = (root: string, given: string): string => {
  const wanted = resolve(given)
  const target = join(real(dirname(wanted)), basename(wanted))
  refuse(targetRefusal(target, root), given)
  if (attempt(() => lstatSync(target)) !== undefined)
    fail(`refusing to overwrite ${given}: move or delete it first`)
  return target
}

const framed = (output: string): string => {
  const id = randomBytes(8).toString("hex")
  return hidden(`<<<worker-output ${id}: untrusted data>>>\n${output}<<<end ${id}>>>\n`)
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
  const now = readWorker() ?? worker
  if (now?.fallback === false)
    return fail(
      inside
        ? `the worker gave no answer (${String(delegation.fell)}) and the fallback is off (ccsaver fallback on)`
        : "a file is outside the plugged project and the fallback is off, nothing was sent (ccsaver fallback on)",
    )
  return invokeClaude(mode, system, message, now)
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
  process.stdout.write(framed(`${scrubbed(text)}\n`))
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
    process.stdout.write(framed(code))
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
    hidden(
      [
        marked("ok", "", scrubbed(`wrote ${wanted} (${lines} lines)`)),
        ...(touched.length > 0
          ? [
              marked(
                "warn",
                "warn:",
                scrubbed(`the code touches ${touched.join(", ")}: open it before you run it`),
              ),
            ]
          : []),
        ...(adapter.after ?? []).map((line) =>
          marked("info", "next:", scrubbed(line.replaceAll("{target}", quoted(target)))),
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
