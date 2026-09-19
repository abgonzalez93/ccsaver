import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  attempt,
  crashed,
  DEFAULT_LIMITS,
  isEncrypted,
  isRecord,
  keyFile,
  loadAdapter,
  logDir,
  logFile,
  messageOf,
  parsed,
  plug,
  Refusal,
  readKey,
  readPlugged,
  readWorker,
  record,
  setClaude,
  setFallback,
  setLog,
  stateHome,
  unplug,
  type Worker,
  writeWorker,
} from "./state.ts"
import { CLAUDE_ON_PATH, claudeBin, fellOf, requestOf } from "./transport.ts"
import { isMode, runWorker } from "./worker.ts"

const USAGE = `usage: ccsaver <command>

  plug <dir> [adapter]       turn ccsaver on for one project
  unplug <dir>               turn it off again
  list                       show the plugged projects
  worker set <url> <model>   point at an OpenAI-compatible chat completions endpoint
  worker claude <path>|auto  pin the claude binary the fallback runs (auto: the session's own)
  key set                    store the API key (typed on the terminal, never an argument)
  fallback on|off            whether a call the worker cannot take goes to paid Claude Haiku
  log on|off                 record events (metadata only) in a local file; off by default
  doctor                     check permissions, key, worker, fallback and projects
  version                    print the version

  bulk-read  --question=<q> --paths <file>... [--project <dir>]
  code-write --spec=<s> --reference <file>... [--target <out>] [--project <dir>]
`

const PROBE_TIMEOUT_MS = 30_000
const GATE = join(import.meta.dirname, "..", "hooks", "read-gate")
const PACKAGE = join(import.meta.dirname, "..", "package.json")
const HELP = [undefined, "help", "--help", "-h"]
const WHY = {
  timeout: "timed out",
  "not json": "did not answer JSON",
  unreachable: "is unreachable",
} as const

type Level = "ok" | "warn" | "FAIL"

interface Finding {
  level: Level
  text: string
}

const NOTHING_PLUGGED: Finding = { level: "warn", text: "plugged: nothing" }

const shown = (url: string): string => {
  const parts = attempt(() => new URL(url))
  return parts === undefined ? "(an unreadable url)" : `${parts.origin}${parts.pathname}`
}

const modeOf = (path: string): number | undefined => attempt(() => statSync(path).mode & 0o777)

const permissions = (label: string, path: string, expected: number): Finding => {
  const mode = modeOf(path)
  if (mode === undefined) return { level: "warn", text: `${label}: ${path} does not exist yet` }
  return mode === expected
    ? { level: "ok", text: `${label}: ${path} (${expected.toString(8)})` }
    : {
        level: "FAIL",
        text: `${label}: ${path} is ${mode.toString(8)}, expected ${expected.toString(8)}`,
      }
}

const probe = async (url: string, model: string, key: string): Promise<Finding> => {
  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      redirect: "error",
      body: JSON.stringify(requestOf(model, "ping", "ping")),
    })
    const took = `${Math.round(performance.now() - started)} ms`
    if (response.status === 200)
      return { level: "ok", text: `probe: ${model} accepted the key in ${took}` }
    return response.status === 401 || response.status === 403
      ? { level: "FAIL", text: `probe: the key was rejected (${response.status})` }
      : { level: "FAIL", text: `probe: ${model} answered ${response.status} in ${took}` }
  } catch (error) {
    return { level: "FAIL", text: `probe: ${shown(url)} ${WHY[fellOf(error)]}` }
  }
}

const external = async (worker: Worker | undefined): Promise<Finding[]> => {
  if (worker === undefined)
    return [{ level: "warn", text: "worker: not configured, every delegation uses the fallback" }]
  if (!isEncrypted(worker.url)) return [{ level: "FAIL", text: "worker: the url is not https" }]
  const configured: Finding = {
    level: "ok",
    text: `worker: ${shown(worker.url)} · ${worker.model}`,
  }
  const key = readKey()
  if (key === undefined)
    return [configured, { level: "FAIL", text: "key: missing, run: ccsaver key set" }]
  return [
    configured,
    permissions("key", keyFile(), 0o600),
    await probe(worker.url, worker.model, key),
  ]
}

const fallback = (worker: Worker | undefined): Finding => {
  if (worker?.fallback === false)
    return {
      level: "ok",
      text: "fallback: off, a call the worker cannot take fails instead of going to Claude Haiku",
    }
  const bin = claudeBin(worker)
  const run = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15_000 })
  if (run.status === 0) return { level: "ok", text: `fallback: ${bin} (${run.stdout.trim()})` }
  return bin === CLAUDE_ON_PATH && process.env["CLAUDE_CODE_CHILD_SESSION"] !== "1"
    ? {
        level: "warn",
        text: "fallback: claude does not run from this shell; a Claude Code session brings its own binary, so run doctor from inside one",
      }
    : { level: "FAIL", text: `fallback: ${bin} does not run; set "claude" in worker.json` }
}

const gate = (root: string, lines: number): Finding => {
  const dir = mkdtempSync(join(tmpdir(), "ccsaver-doctor-"))
  try {
    const long = join(dir, "long.txt")
    writeFileSync(long, "x\n".repeat(lines))
    const run = spawnSync("sh", [GATE], {
      encoding: "utf8",
      timeout: 15_000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      input: JSON.stringify({ tool_use_id: "doctor", tool_input: { file_path: long } }),
    })
    return run.status === 0 && run.stdout.includes('"permissionDecision":"deny"')
      ? { level: "ok", text: `gate: ${root} · the hook denied a ${lines}-line read` }
      : { level: "FAIL", text: `gate: ${root} · the hook let a ${lines}-line read through` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const projects = (): Finding[] =>
  readPlugged().flatMap(({ root, adapter }) => {
    if (!existsSync(root)) return [{ level: "warn", text: `plugged: ${root} no longer exists` }]
    try {
      const limits = { ...DEFAULT_LIMITS, ...(adapter === undefined ? {} : loadAdapter(adapter)) }
      return [
        {
          level: "ok",
          text: `plugged: ${root} · adapter ${adapter ?? "none"} · reads over ${limits.maxLines} lines or ${limits.maxTokens} tokens are denied`,
        },
        gate(root, limits.maxLines + 1),
      ]
    } catch (error) {
      return [{ level: "FAIL", text: `plugged: ${root} · ${messageOf(error)}` }]
    }
  })

const log = (): Finding => {
  const mode = modeOf(logDir())
  if (mode === undefined)
    return { level: "ok", text: "log: off (ccsaver log on records events, on this machine only)" }
  const file = logFile()
  const bytes = existsSync(file) ? statSync(file).size : 0
  return mode === 0o700 && (modeOf(file) ?? 0o600) === 0o600
    ? { level: "ok", text: `log: on · ${logDir()} (700) · ${bytes} bytes this month` }
    : { level: "FAIL", text: `log: ${logDir()} must be 700 and its files 600` }
}

const spent = (): Finding[] => {
  const text = attempt(() => readFileSync(logFile(), "utf8"))
  if (text === undefined) return []
  const calls = text
    .split("\n")
    .map((line) => parsed(line))
    .filter(isRecord)
    .filter((row) => row["kind"] === "delegate")
  const paid = calls.filter((row) => row["answered"] === "fallback")
  const usd = paid.reduce(
    (sum, row) => sum + (typeof row["cost"] === "number" ? row["cost"] : 0),
    0,
  )
  const why = Object.entries(Object.groupBy(paid, (row) => String(row["fell"])))
    .map(([fell, rows]) => `${rows?.length ?? 0} ${fell}`)
    .join(", ")
  return [
    {
      level: "ok",
      text: `spent: ${paid.length} of ${calls.length} delegations this month went to paid Claude Haiku ($${usd.toFixed(4)})${paid.length > 0 ? `: ${why}` : ""}`,
    },
  ]
}

const workers = async (): Promise<Finding[]> => {
  try {
    const worker = readWorker()
    return [...(await external(worker)), fallback(worker)]
  } catch (error) {
    return [{ level: "FAIL", text: `worker: ${messageOf(error)}` }]
  }
}

const version = (): string => {
  const raw = parsed(attempt(() => readFileSync(PACKAGE, "utf8")) ?? "")
  return isRecord(raw) && typeof raw["version"] === "string" ? raw["version"] : "unknown"
}

const doctor = async (): Promise<number> => {
  const plugged = projects()
  const findings = [
    permissions("state", stateHome(), 0o700),
    log(),
    ...spent(),
    ...(await workers()),
    ...(plugged.length > 0 ? plugged : [NOTHING_PLUGGED]),
  ]
  for (const { level, text } of findings) process.stdout.write(`${level.padEnd(4)} ${text}\n`)
  const count = (wanted: Level): number => findings.filter(({ level }) => level === wanted).length
  record("doctor", { ok: count("ok"), warn: count("warn"), fail: count("FAIL") })
  return count("FAIL") > 0 ? 1 : 0
}

const main = async (): Promise<number> => {
  const [command, first, second, third] = process.argv.slice(2)
  if (isMode(command)) {
    await runWorker(command, process.argv.slice(3))
    return 0
  }
  switch (command) {
    case "plug": {
      if (first === undefined) break
      const { root, adapter } = plug(first, second)
      process.stdout.write(`plugged ${root} · adapter ${adapter ?? "none"}\n`)
      return 0
    }
    case "unplug": {
      if (first === undefined) break
      process.stdout.write(unplug(first) ? `unplugged ${first}\n` : `${first} was not plugged\n`)
      return 0
    }
    case "list": {
      const entries = readPlugged()
      process.stdout.write(
        entries.length === 0
          ? "nothing is plugged in\n"
          : entries.map(({ root, adapter }) => `${root}\t${adapter ?? ""}\n`).join(""),
      )
      return 0
    }
    case "worker": {
      if (first === "claude" && second !== undefined) {
        const pinned = setClaude(second === "auto" ? undefined : second)
        process.stdout.write(`fallback binary: ${pinned ?? "the session's own claude"}\n`)
        return 0
      }
      if (first !== "set" || second === undefined || third === undefined) break
      const advice = writeWorker(second, third)
      process.stdout.write(`worker set to ${shown(second)} · ${third}\n`)
      if (advice !== undefined) process.stderr.write(`warn: ${advice}\n`)
      return 0
    }
    case "fallback": {
      if (first !== "on" && first !== "off") break
      setFallback(first === "on")
      process.stdout.write(`fallback ${first}\n`)
      return 0
    }
    case "log": {
      if (first !== "on" && first !== "off") break
      setLog(first === "on")
      process.stdout.write(`log ${first}\n`)
      return 0
    }
    case "key":
      if (first !== "set") break
      process.stderr.write("Error: run the ccsaver launcher (bin/ccsaver key set)\n")
      return 1
    case "doctor":
      return doctor()
    case "version":
    case "--version":
      process.stdout.write(`${version()}\n`)
      return 0
    default:
      break
  }
  const asked = HELP.includes(command)
  const stream = asked ? process.stdout : process.stderr
  stream.write(USAGE)
  return asked ? 0 : 1
}

try {
  process.exitCode = await main()
} catch (error) {
  if (error instanceof Refusal) record("fail", { text: error.message })
  else crashed("cli", error)
  process.stderr.write(`Error: ${messageOf(error)}\n`)
  process.exitCode = 1
}
