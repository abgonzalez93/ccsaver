// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { spawnSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  type Adapter,
  encrypted,
  isRecord,
  isUnder,
  keyFile,
  loadAdapter,
  pluggedRootOf,
  readWorker,
  real,
} from "./state.ts"

const MODES = {
  "bulk-read":
    "You are a precise code analyst. Read the provided files and answer the question concisely. Output structured bullets only. No greetings, no prose, no preambles, no summaries. Lead every bullet with the exact name, type, or line number. Use nested bullets for details. Skip anything the caller did not ask for.",
  "code-write":
    "You generate code files based on a spec and reference files. Match the existing patterns, conventions, naming, and style exactly. Output only the code — no explanations, no markdown fences unless asked. If the spec is ambiguous, make reasonable choices that match the patterns in the reference code.",
} as const

type Mode = keyof typeof MODES

const HOUSE_RULES = " House rules, they win over the reference: "
const FALLBACK_MODEL = "haiku"
const TIMEOUT_MS = 180_000
const EXTERNAL_TIMEOUT_MS = 30_000
const SECRET_NAME =
  /^\.env|^\.dev\.vars$|^\.credentials\.json$|^\.claude\.json$|^settings\.local\.json$|^api-key$|^\.npmrc$|^\.netrc$|^\.git-credentials$|^credentials(\.|$)|^\.?secrets?(\.|$)|^id_(rsa|ed25519|ecdsa|dsa)|\.(key|pem|p12|pfx|jks|keystore)$/

export const isMode = (value: string | undefined): value is Mode =>
  value !== undefined && Object.hasOwn(MODES, value)

const fail: (message: string) => never = (message) => {
  process.stderr.write(`Error: ${message}\n`)
  process.exit(1)
}

const note = (text: string): void => {
  process.stderr.write(`[ccsaver: ${text}]\n`)
}

export const claudeBin = (): string =>
  readWorker()?.claude ?? (process.env["CLAUDE_CODE_EXECPATH"] || "claude")

const instructionOf = (mode: Mode, adapter: Adapter): string =>
  mode === "code-write" && adapter.rules
    ? `${MODES[mode]}${HOUSE_RULES}${adapter.rules}`
    : MODES[mode]

const fileBlock = (given: string, numbered: boolean, root: string): string => {
  const path = real(given)
  const label = isUnder(path, root) ? relative(root, path) : given
  if ([given, path].some((name) => SECRET_NAME.test(basename(name))))
    fail(`refusing to send a secrets file to a worker: ${given}`)
  const text = ((): string => {
    try {
      return readFileSync(path, "utf8")
    } catch {
      return fail(`file not found or unreadable: ${given}`)
    }
  })()
  const body = numbered
    ? (text.endsWith("\n") ? text.slice(0, -1) : text)
        .split("\n")
        .map((line, i) => `${i + 1}\t${line}`)
        .join("\n")
    : text
  return `<file path="${label}">\n${body}\n</file>\n\n`
}

const invokeClaude = (mode: Mode, system: string, message: string): string => {
  const run = spawnSync(
    claudeBin(),
    [
      "-p",
      "--model",
      FALLBACK_MODEL,
      "--system-prompt",
      system,
      "--tools",
      "",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--output-format",
      "json",
    ],
    {
      input: message,
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, MAX_THINKING_TOKENS: "0" },
    },
  )
  if (run.error) return fail(`fallback worker could not run: ${run.error.message}`)
  if (run.status !== 0)
    return fail(`fallback worker exited ${run.status ?? run.signal}: ${run.stderr.slice(0, 400)}`)
  const raw: unknown = JSON.parse(run.stdout)
  if (!isRecord(raw) || typeof raw["result"] !== "string")
    return fail("fallback worker returned no result")
  const cost = typeof raw["total_cost_usd"] === "number" ? raw["total_cost_usd"].toFixed(4) : "?"
  note(
    `~${Math.round(message.length / 4)} input tokens | $${cost} | ${FALLBACK_MODEL} | delegated to ${mode}`,
  )
  return raw["result"]
}

const contentOf = (raw: unknown): string | undefined => {
  if (!isRecord(raw) || !Array.isArray(raw["choices"])) return undefined
  const first: unknown = raw["choices"][0]
  if (!isRecord(first) || !isRecord(first["message"]) || first["finish_reason"] === "length")
    return undefined
  const content = first["message"]["content"]
  return typeof content === "string" && content.length > 0 ? content : undefined
}

const apiKey = (): string | undefined => {
  try {
    return readFileSync(keyFile(), "utf8").trim() || undefined
  } catch {
    return undefined
  }
}

const invokeExternal = async (
  mode: Mode,
  system: string,
  message: string,
): Promise<string | undefined> => {
  const worker = readWorker()
  const key = apiKey()
  if (worker === undefined || key === undefined) return undefined
  if (!encrypted(worker.url)) {
    note("the worker url is not https, falling back")
    return undefined
  }
  try {
    const response = await fetch(worker.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      body: JSON.stringify({
        model: worker.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
      }),
    })
    const raw: unknown = response.ok ? await response.json() : undefined
    const content = contentOf(raw)
    if (content === undefined) {
      note(`${worker.model} answered ${response.status} without a complete result, falling back`)
      return undefined
    }
    note(
      `~${Math.round(message.length / 4)} input tokens | external | ${worker.model} | delegated to ${mode}`,
    )
    return content
  } catch {
    note(`${worker.model} unreachable, falling back`)
    return undefined
  }
}

const peeled = (code: string): string =>
  code
    .replace(/^\s*```[^\n]*\n/, "")
    .replace(/\n```\s*$/, "")
    .replace(/^\s*<file[^>]*>\s*\n/, "")
    .replace(/\n<\/file>\s*$/, "")

const unwrapped = (code: string): string => `${peeled(peeled(code)).trim()}\n`

const format = (adapter: Adapter, root: string, target: string): void => {
  const [command, ...args] = adapter.format ?? []
  if (command === undefined) return
  const run = spawnSync(
    command.includes("/") ? resolve(root, command) : command,
    [...args, target],
    { cwd: root },
  )
  if (run.error)
    note(`the formatter could not run (${run.error.message}), ${target} is unformatted`)
}

export const runWorker = async (mode: Mode, argv: string[]): Promise<void> => {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      project: { type: "string" },
      question: { type: "string" },
      paths: { type: "string", multiple: true },
      spec: { type: "string" },
      reference: { type: "string", multiple: true },
      target: { type: "string" },
    },
  })
  const projectDir = values.project || process.cwd()
  const project = pluggedRootOf(projectDir)
  if (project === undefined)
    fail(`${projectDir} is not plugged in, nothing was sent (ccsaver plug <dir> turns it on)`)
  const adapter = ((): Adapter => {
    try {
      return project.adapter === undefined ? {} : loadAdapter(project.adapter)
    } catch (error) {
      return fail(error instanceof Error ? error.message : "adapter could not be loaded")
    }
  })()
  const files = [...(values.paths ?? []), ...(values.reference ?? []), ...positionals].map((path) =>
    resolve(path),
  )
  if (files.length === 0) fail("at least one file is required (--paths / --reference)")
  const system = instructionOf(mode, adapter)
  const invoke = async (message: string): Promise<string> =>
    (files.every((file) => isUnder(real(file), project.root))
      ? await invokeExternal(mode, system, message)
      : undefined) ?? invokeClaude(mode, system, message)
  if (mode === "bulk-read") {
    if (!values.question) fail("--question is required")
    const corpus = files.map((path) => fileBlock(path, true, project.root)).join("")
    process.stdout.write(`${await invoke(`${corpus}Question: ${values.question}\n`)}\n`)
    return
  }
  if (!values.spec) fail("--spec is required")
  const corpus = files.map((path) => fileBlock(path, false, project.root)).join("")
  const code = unwrapped(await invoke(`${corpus}Spec: ${values.spec}\n`))
  if (!values.target) {
    process.stdout.write(code)
    return
  }
  const target = resolve(values.target)
  try {
    writeFileSync(target, code, { flag: "wx" })
  } catch (error) {
    const reason = isRecord(error) ? error["code"] : undefined
    fail(
      reason === "EEXIST"
        ? `refusing to overwrite ${values.target}: move or delete it first`
        : `cannot write ${values.target}: ${String(reason)}`,
    )
  }
  format(adapter, project.root, target)
  const written = readFileSync(target, "utf8")
  process.stdout.write(
    [
      `wrote ${values.target} (${written.split("\n").length - 1} lines)`,
      ...(adapter.after ?? []).map((line) => `next: ${line.replaceAll("{target}", target)}`),
    ]
      .join("\n")
      .concat("\n"),
  )
}
