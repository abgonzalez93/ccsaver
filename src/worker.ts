// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join, relative, resolve } from "node:path"
import { parseArgs } from "node:util"
import {
  type Adapter,
  encrypted,
  isRecord,
  isUnder,
  loadAdapter,
  parsed,
  pluggedRootOf,
  readKey,
  readWorker,
  real,
  record,
  stateHome,
  type Worker,
} from "./state.ts"

const MODES = {
  "bulk-read":
    'You are a precise code analyst. Read the provided files and answer the question concisely. Output structured bullets only. No greetings, no prose, no preambles, no summaries. Lead every bullet with the exact name, type, or line number. Use nested bullets for details. Skip anything the caller did not ask for. End every bullet with " @ " and the one line that proves it, copied the way grep -n prints it: path:line:text.',
  "code-write":
    "You generate code files based on a spec and reference files. Match the existing patterns, conventions, naming, and style exactly. Output only the code — no explanations, no markdown fences unless asked. If the spec is ambiguous, make reasonable choices that match the patterns in the reference code.",
} as const

type Mode = keyof typeof MODES

const HOUSE_RULES = " House rules, they win over the reference: "
const FALLBACK_MODEL = "haiku"
const NO_MCP_SERVERS = '{"mcpServers":{}}'
const TIMEOUT_MS = 180_000
const EXTERNAL_TIMEOUT_MS = 30_000
const FORMAT_TIMEOUT_MS = 60_000
const FALLBACK_MAX_CHARS = 400_000
const SECRET_NAME =
  /^\.env|^\.dev\.vars$|^\.credentials\.json$|^\.claude\.json$|^settings\.local\.json$|^api-key$|^\.npmrc$|^\.netrc$|^\.pypirc$|^\.pgpass$|^\.htpasswd$|^\.git-credentials$|^kubeconfig|^credentials(\.|$)|^\.?secrets?(\.|$)|^id_(rsa|ed25519|ecdsa|dsa)|\.(key|pem|p12|pfx|jks|keystore|ppk|kdbx|tfvars|tfstate)$|\.tfstate\.backup$/i
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/
const PROTECTED_PLACE =
  /(^|\/)(\.git|\.config\/git|\.vscode|\.idea|\.husky|\.cargo|\.devcontainer|\.yarn|\.mvn|\.claude)(\/|$)/i
const PROTECTED_NAME =
  /^(\.gitconfig|\.gitmodules|\.bash(rc|_profile|_login|_aliases|_logout)|\.z(shrc|profile|shenv|login|logout)|\.profile|\.envrc|\.npmrc|\.yarnrc(\.yml)?|\.pnp\.(cjs|loader\.mjs)|\.pnpmfile\.cjs|\.?bunfig\.toml|\.bazel(rc|version|iskrc)|\.pre-commit-config\.yaml|\.?lefthook\.ya?ml|(gradle|maven)-wrapper\.properties|\.devcontainer\.json|\.ripgreprc|pyrightconfig\.json|\.mcp\.json|\.claude\.json)$/i

export const isMode = (value: string | undefined): value is Mode =>
  value !== undefined && Object.hasOwn(MODES, value)

const delegation: Record<string, unknown> = {}

const fail: (message: string) => never = (message) => {
  record("fail", { text: message })
  process.stderr.write(`Error: ${message}\n`)
  process.exit(1)
}

const note = (text: string): void => {
  record("note", { text })
  process.stderr.write(`[ccsaver: ${text}]\n`)
}

export const CLAUDE_ON_PATH = "claude"

export const claudeBin = (worker: Worker | undefined): string =>
  worker?.claude ?? (process.env["CLAUDE_CODE_EXECPATH"] || CLAUDE_ON_PATH)

const instructionOf = (mode: Mode, adapter: Adapter): string =>
  mode === "code-write" && adapter.rules
    ? `${MODES[mode]}${HOUSE_RULES}${adapter.rules}`
    : MODES[mode]

interface Sent {
  label: string
  lines: string[]
  block: string
  inside: boolean
}

const fileBlock = (given: string, numbered: boolean, root: string): Sent => {
  const path = real(given)
  const inside = isUnder(path, root)
  const label = inside ? relative(root, path) : given
  if (isUnder(path, real(stateHome())))
    fail(`refusing to send a file from the ccsaver state folder: ${given}`)
  if ([given, path].some((name) => SECRET_NAME.test(basename(name))))
    fail(`refusing to send a secrets file to a worker: ${given}`)
  const text = ((): string => {
    try {
      return readFileSync(path, "utf8")
    } catch {
      return fail(`file not found or unreadable: ${given}`)
    }
  })()
  if (PRIVATE_KEY.test(text)) fail(`refusing to send a file that holds a private key: ${given}`)
  const lines = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n")
  const body = numbered ? lines.map((line, i) => `${i + 1}\t${line}`).join("\n") : text
  return { label, lines, block: `<file path="${label}">\n${body}\n</file>\n\n`, inside }
}

const same = (line: string, text: string): boolean =>
  line.trim() === text || (text.length >= 20 && line.trim().startsWith(text))

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const checked = (answer: string, sent: Sent[]): string => {
  const labels = sent.map(({ label }) => escaped(label)).join("|")
  const cited = new RegExp(`^(.*)(?<![\\w./-])(${labels}):(\\d+):(.*)$`)
  const tally = { match: 0, renumbered: 0, unverified: 0, bare: 0 }
  const rows = answer.split("\n").map((row) => {
    const [, before = "", label = "", claimed = "", quoted = ""] = cited.exec(row) ?? []
    if (label === "") {
      if (row.trim() !== "") tally.bare += 1
      return row
    }
    const text = quoted
      .trim()
      .replace(/^`(.*)`$/, "$1")
      .trim()
    const places = (sent.find((file) => file.label === label)?.lines ?? []).flatMap((line, i) =>
      text !== "" && same(line, text) ? [i + 1] : [],
    )
    const line = places.includes(Number(claimed))
      ? Number(claimed)
      : places.length === 1
        ? places[0]
        : undefined
    tally[line === undefined ? "unverified" : line === Number(claimed) ? "match" : "renumbered"] +=
      1
    const kept = before.replace(/^[\s*+-]+/, "") === "" ? `:${quoted}` : ""
    return `${before}${label}:${line ?? claimed}${kept}${line === undefined ? " [unverified]" : ""}`
  })
  delegation["cited"] = tally
  note(
    `cited lines: ${tally.match} match the files, ${tally.renumbered} renumbered, ${tally.unverified} unverified${tally.bare > 0 ? `; answer lines without a citation: ${tally.bare}` : ""}`,
  )
  return rows.join("\n")
}

const invokeClaude = (
  mode: Mode,
  system: string,
  message: string,
  worker: Worker | undefined,
): string => {
  if (message.length > FALLBACK_MAX_CHARS)
    return fail(
      `the files are ~${Math.round(message.length / 4)} tokens by chars/4, over the ${FALLBACK_MAX_CHARS / 4} the Haiku fallback takes: ask about fewer files`,
    )
  const started = performance.now()
  const run = spawnSync(
    claudeBin(worker),
    [
      "-p",
      "--model",
      FALLBACK_MODEL,
      "--system-prompt",
      system,
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      NO_MCP_SERVERS,
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
  delegation["fallbackMs"] = Math.round(performance.now() - started)
  if (run.error) return fail(`fallback worker could not run: ${run.error.message}`)
  if (run.status !== 0)
    return fail(`fallback worker exited ${run.status ?? run.signal}: ${run.stderr.slice(0, 400)}`)
  const raw = parsed(run.stdout)
  if (!isRecord(raw) || typeof raw["result"] !== "string")
    return fail(`fallback worker returned no result: ${run.stdout.slice(0, 200)}`)
  if (raw["is_error"] === true)
    return fail(`fallback worker failed: ${raw["result"].slice(0, 400)}`)
  const cost = typeof raw["total_cost_usd"] === "number" ? raw["total_cost_usd"].toFixed(4) : "?"
  Object.assign(delegation, {
    answered: "fallback",
    model: FALLBACK_MODEL,
    answerChars: raw["result"].length,
    cost: typeof raw["total_cost_usd"] === "number" ? raw["total_cost_usd"] : null,
  })
  note(
    `~${Math.round(message.length / 4)} input tokens by chars/4 | $${cost} | ${FALLBACK_MODEL} | delegated to ${mode}`,
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

const invokeExternal = async (
  mode: Mode,
  system: string,
  message: string,
  worker: Worker | undefined,
): Promise<string | undefined> => {
  const key = readKey()
  if (worker === undefined || key === undefined) {
    delegation["fell"] = worker === undefined ? "no worker" : "no key"
    return undefined
  }
  if (!encrypted(worker.url)) {
    delegation["fell"] = "not https"
    note("the worker url is not https, falling back")
    return undefined
  }
  const started = performance.now()
  try {
    const response = await fetch(worker.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      redirect: "error",
      body: JSON.stringify({
        model: worker.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: message },
        ],
      }),
    })
    delegation["status"] = response.status
    const raw: unknown = response.ok ? await response.json() : undefined
    const content = contentOf(raw)
    if (content === undefined) {
      delegation["fell"] = response.ok ? "incomplete" : "status"
      note(`${worker.model} answered ${response.status} without a complete result, falling back`)
      return undefined
    }
    Object.assign(delegation, {
      answered: "external",
      model: worker.model,
      answerChars: content.length,
    })
    note(
      `~${Math.round(message.length / 4)} input tokens by chars/4 | external | ${worker.model} | delegated to ${mode}`,
    )
    return content
  } catch {
    delegation["fell"] = "unreachable"
    note(`${worker.model} unreachable, falling back`)
    return undefined
  } finally {
    delegation["externalMs"] = Math.round(performance.now() - started)
  }
}

const FENCED = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/
const WRAPPED = /^\s*<file[^>]*>\s*\n([\s\S]*?)\n?<\/file>\s*$/

const peeled = (code: string): string => code.replace(FENCED, "$1").replace(WRAPPED, "$1")

const unwrapped = (code: string): string => `${peeled(peeled(code)).trim()}\n`

const format = (adapter: Adapter, root: string, target: string): void => {
  const [command, ...args] = adapter.format ?? []
  if (command === undefined) return
  const run = spawnSync(
    command.includes("/") ? resolve(root, command) : command,
    [...args, target],
    { cwd: root, timeout: FORMAT_TIMEOUT_MS },
  )
  delegation["format"] = run.error
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
  if (!isUnder(target, root)) fail(`refusing to write outside the plugged project: ${given}`)
  if (PROTECTED_PLACE.test(relative(root, target)) || PROTECTED_NAME.test(basename(target)))
    fail(`refusing to write a path that Claude Code protects: ${given}`)
  if (existsSync(target)) fail(`refusing to overwrite ${given}: move or delete it first`)
  return target
}

const quoted = (path: string): string =>
  /^[\w./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`

const marked = (output: string): string => {
  const id = randomBytes(4).toString("hex")
  return `<<<worker-output ${id}: untrusted data>>>\n${output}<<<end ${id}>>>\n`
}

export const runWorker = async (mode: Mode, argv: string[]): Promise<void> => {
  process.once("exit", (exit) => {
    record("delegate", { mode, ...delegation, exit, ms: Math.round(performance.now()) })
  })
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
  Object.assign(delegation, { root: project.root, adapter: project.adapter ?? null })
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
  const worker = readWorker()
  const invoke = async (message: string, sent: Sent[]): Promise<string> => {
    const inside = sent.every((file) => file.inside)
    Object.assign(delegation, {
      files: sent.length,
      outside: sent.filter((file) => !file.inside).length,
      chars: message.length,
      ...(inside ? {} : { fell: "outside" }),
    })
    const answer = inside ? await invokeExternal(mode, system, message, worker) : undefined
    if (answer !== undefined) return answer
    if (worker?.fallback === false)
      return fail(
        inside
          ? "the worker did not answer and the fallback is off (ccsaver fallback on)"
          : "a file is outside the plugged project and the fallback is off, nothing was sent (ccsaver fallback on)",
      )
    return invokeClaude(mode, system, message, worker)
  }
  if (mode === "bulk-read") {
    if (!values.question) fail("--question is required")
    const sent = files.map((path) => fileBlock(path, true, project.root))
    const corpus = sent.map(({ block }) => block).join("")
    const answer = await invoke(`${corpus}Question: ${values.question}\n`, sent)
    process.stdout.write(marked(`${checked(answer, sent)}\n`))
    return
  }
  if (!values.spec) fail("--spec is required")
  const target = values.target ? targetIn(project.root, values.target) : undefined
  delegation["target"] = target !== undefined
  const sent = files.map((path) => fileBlock(path, false, project.root))
  const corpus = sent.map(({ block }) => block).join("")
  const code = unwrapped(await invoke(`${corpus}Spec: ${values.spec}\n`, sent))
  if (target === undefined) {
    process.stdout.write(marked(code))
    return
  }
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
  delegation["written"] = written.split("\n").length - 1
  process.stdout.write(
    [
      `wrote ${values.target} (${written.split("\n").length - 1} lines)`,
      ...(adapter.after ?? []).map(
        (line) => `next: ${line.replaceAll("{target}", quoted(target))}`,
      ),
    ]
      .join("\n")
      .concat("\n"),
  )
}
