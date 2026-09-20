import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Limits, limitsFor, readPlugged, readWorker, type Worker } from "./config.ts"
import { logDir, logFile, record } from "./log.ts"
import {
  attempt,
  isEncrypted,
  isRecord,
  keyFile,
  keyIsStored,
  messageOf,
  parsed,
  pluggedFile,
  readKey,
  stateHome,
  workerFile,
} from "./state.ts"
import { overshoots, proposalOf, surveyFor } from "./survey.ts"
import { CLAUDE_ON_PATH, claudeBin, fellOf, postJson, requestOf, shown } from "./transport.ts"

const PROBE_TIMEOUT_MS = 30_000
const GATE = join(import.meta.dirname, "..", "hooks", "read-gate")
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
    const response = await postJson(url, key, requestOf(model, "ping", "ping"), PROBE_TIMEOUT_MS)
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
    return [
      configured,
      keyIsStored()
        ? { level: "FAIL", text: `key: ${keyFile()} cannot be read: check its owner and its mode` }
        : { level: "FAIL", text: "key: missing, run: ccsaver key set" },
    ]
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

const shape = (root: string, limits: Limits, adapter?: string): Finding[] => {
  const survey = surveyFor(root)
  return overshoots(survey, limits)
    ? [{ level: "warn", text: `shape: ${root} · ${proposalOf(survey, limits, root, adapter)}` }]
    : []
}

const projects = (): Finding[] =>
  readPlugged().flatMap(({ root, adapter }) => {
    if (!existsSync(root)) return [{ level: "warn", text: `plugged: ${root} no longer exists` }]
    try {
      const limits = limitsFor(adapter)
      return [
        {
          level: "ok",
          text: `plugged: ${root} · adapter ${adapter ?? "none"} · reads over ${limits.maxLines} lines or ${limits.maxTokens} tokens are denied`,
        },
        gate(root, limits.maxLines + 1),
        ...shape(root, limits, adapter),
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

const rowsOf = (kind: string): Record<PropertyKey, unknown>[] =>
  (attempt(() => readFileSync(logFile(), "utf8")) ?? "")
    .split("\n")
    .map((line) => parsed(line))
    .filter(isRecord)
    .filter((row) => row["kind"] === kind)

const denied = (): Finding[] => {
  const gates = rowsOf("gate").filter((row) => row["tool_use_id"] !== "doctor")
  const whole = gates.filter((row) => row["reason"] !== "range")
  if (whole.length === 0) return []
  const why = whole.filter((row) => row["decision"] === "deny")
  const counted = why
    .flatMap((row) => (typeof row["lines"] === "number" ? [row["lines"]] : []))
    .sort((first, second) => first - second)
  const middle = counted[Math.floor(counted.length / 2)]
  const longest = middle === undefined ? "" : `, median ${middle} lines`
  const share = Math.round((100 * why.length) / whole.length)
  return [
    {
      level: "ok",
      text: `denied: ${why.length} of ${whole.length} whole-file reads this month (${share} %)${longest}`,
    },
  ]
}

const spent = (): Finding[] => {
  const text = attempt(() => readFileSync(logFile(), "utf8"))
  if (text === undefined) return []
  const calls = rowsOf("delegate")
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

export const doctor = async (): Promise<number> => {
  const plugged = projects()
  const findings = [
    permissions("state", stateHome(), 0o700),
    permissions("plugged file", pluggedFile(), 0o600),
    permissions("worker file", workerFile(), 0o600),
    log(),
    ...denied(),
    ...spent(),
    ...(await workers()),
    ...(plugged.length > 0 ? plugged : [NOTHING_PLUGGED]),
  ]
  for (const { level, text } of findings) process.stdout.write(`${level.padEnd(4)} ${text}\n`)
  const count = (wanted: Level): number => findings.filter(({ level }) => level === wanted).length
  record("doctor", { ok: count("ok"), warn: count("warn"), fail: count("FAIL") })
  return count("FAIL") > 0 ? 1 : 0
}
