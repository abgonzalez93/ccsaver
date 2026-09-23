import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CLAUDE_ON_PATH,
  claudeBin,
  fellOf,
  postJson,
  requestOf,
  shown,
} from "../delegation/worker.client.ts"
import { readWorker, type Worker } from "../delegation/worker.store.ts"
import {
  type Limits,
  limitsFor,
  type Plugged,
  plug,
  readPlugged,
  writeLimits,
} from "../state/config.store.ts"
import { handoffDir, handoffFile, readHandoff } from "../state/handoff.store.ts"
import { logDir, logFile, numberAt, type Rows, readEvents, record } from "../state/log.store.ts"
import {
  adaptersDir,
  attempt,
  isEncrypted,
  keyFile,
  keyIsCarriable,
  keyIsStored,
  marked,
  messageOf,
  pluggedFile,
  pricesFile,
  readKey,
  scrubbed,
  stateHome,
  workerFile,
} from "../state/state.store.ts"
import { type Finding, type Level, offer, painted, TONE } from "./finding.model.ts"
import { launcherFindings } from "./launcher.service.ts"
import {
  adapterNameOf,
  fixOf,
  overshoots,
  proposalOf,
  raiseOf,
  surveyFor,
} from "./survey.service.ts"

const PROBE_TIMEOUT_MS = 30_000
const GATE = join(import.meta.dirname, "..", "..", "hooks", "gate")
const WHY = {
  timeout: "timed out",
  "not json": "did not answer JSON",
  unreachable: "is unreachable",
} as const

const NOTHING_PLUGGED: Finding = { level: "warn", text: "plugged: nothing" }

const OTHERS = 0o077

const modeOf = (path: string): number | undefined => attempt(() => statSync(path).mode & 0o777)

const isPrivate = (mode: number, expected: number): boolean => {
  const owner = expected & 0o500
  return (mode & OTHERS) === 0 && (mode & owner) === owner
}

const permissions = (label: string, path: string, expected: number): Finding => {
  const mode = modeOf(path)
  if (mode === undefined) return { level: "warn", text: `${label}: ${path} does not exist yet` }
  return isPrivate(mode, expected)
    ? { level: "ok", text: `${label}: ${path} (${mode.toString(8)})` }
    : {
        level: "FAIL",
        text: `${label}: ${path} is ${mode.toString(8)}, expected ${expected.toString(8)}`,
      }
}

const optional = (label: string, path: string, expected: number): Finding[] =>
  existsSync(path) ? [permissions(label, path, expected)] : []

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

const keyFault = (key: string | undefined): Finding => {
  if (key !== undefined)
    return {
      level: "FAIL",
      text: `key: ${keyFile()} holds a character no HTTP header can carry, so no request was made: run ccsaver key set`,
    }
  return keyIsStored()
    ? { level: "FAIL", text: `key: ${keyFile()} cannot be read: check its owner and its mode` }
    : { level: "FAIL", text: "key: missing, run: ccsaver key set" }
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
  if (key === undefined || !keyIsCarriable(key)) return [configured, keyFault(key)]
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
    const run = spawnSync("sh", [GATE, "read-gate"], {
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

const applied = (root: string, name: string, raise: Partial<Limits>, plugged: boolean): string => {
  const { place } = writeLimits(name, raise)
  if (plugged) return `adapter ${name} written to ${place}`
  plug(root, name)
  return `adapter ${name} written to ${place}, and ${root} now points at it`
}

const shape = (root: string, limits: Limits, adapter?: string): Finding[] => {
  const survey = surveyFor(root)
  if (!overshoots(survey, limits)) return []
  const name = adapter ?? adapterNameOf(root)
  const raise = raiseOf(survey, limits)
  return [
    {
      level: "warn",
      text: `shape: ${root} · ${proposalOf(survey, limits, root, adapter)}`,
      fix: {
        shown: fixOf(survey, limits, root, adapter),
        apply: () => applied(root, name, raise, adapter !== undefined),
      },
    },
  ]
}

const project = ({ root, adapter }: Plugged): Finding[] => {
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
}

const projects = (): Finding[] => {
  try {
    return readPlugged().flatMap(project)
  } catch (error) {
    return [{ level: "FAIL", text: `plugged: ${messageOf(error)}` }]
  }
}

const handoff = (): Finding => {
  try {
    const { on, limit } = readHandoff()
    return { level: "ok", text: `handoff: ${on ? "on" : "off"} · ${limit} tokens` }
  } catch (error) {
    return { level: "FAIL", text: `handoff: ${messageOf(error)}` }
  }
}

const log = (): Finding => {
  const mode = modeOf(logDir())
  if (mode === undefined)
    return { level: "ok", text: "log: off (ccsaver log on records events, on this machine only)" }
  const file = logFile()
  const bytes = attempt(() => statSync(file).size) ?? 0
  return mode === 0o700 && (modeOf(file) ?? 0o600) === 0o600
    ? { level: "ok", text: `log: on · ${logDir()} (700) · ${bytes} bytes this month` }
    : { level: "FAIL", text: `log: ${logDir()} must be 700 and its files 600` }
}

const kindOf = (rows: Rows, kind: string): Rows => rows.filter((row) => row["kind"] === kind)

const middleOf = (sorted: number[]): number | undefined => {
  const half = sorted.length / 2
  const above = sorted[Math.floor(half)]
  const below = sorted[Math.ceil(half) - 1]
  return above === undefined || below === undefined ? undefined : Math.round((below + above) / 2)
}

const denied = (rows: Rows): Finding[] => {
  const gates = kindOf(rows, "gate").filter((row) => row["tool_use_id"] !== "doctor")
  const whole = gates.filter((row) => row["reason"] !== "range")
  if (whole.length === 0) return []
  const why = whole.filter((row) => row["decision"] === "deny")
  const counted = why
    .flatMap((row) => (typeof row["lines"] === "number" ? [row["lines"]] : []))
    .sort((first, second) => first - second)
  const middle = middleOf(counted)
  const median = middle === undefined ? "" : `, median ${middle} lines`
  const share = Math.round((100 * why.length) / whole.length)
  return [
    {
      level: "ok",
      text: `denied: ${why.length} of ${whole.length} whole-file reads this month (${share} %)${median}`,
    },
  ]
}

const spent = (rows: Rows): Finding[] => {
  if (rows.length === 0) return []
  const calls = kindOf(rows, "delegate")
  const paid = calls.filter((row) => row["answered"] === "fallback")
  const usd = paid.reduce((sum, row) => sum + numberAt(row, "cost"), 0)
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

const events = (): [Rows, Finding[]] => {
  try {
    return [readEvents(), []]
  } catch (error) {
    return [[], [{ level: "FAIL", text: `log: ${messageOf(error)}` }]]
  }
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
  const [rows, unread] = events()
  const findings = [
    permissions("state", stateHome(), 0o700),
    permissions("plugged file", pluggedFile(), 0o600),
    permissions("worker file", workerFile(), 0o600),
    ...optional("prices file", pricesFile(), 0o600),
    ...optional("adapters", adaptersDir(), 0o700),
    ...optional("handoff file", handoffFile(), 0o600),
    ...optional("handoffs", handoffDir(), 0o700),
    handoff(),
    log(),
    ...unread,
    ...denied(rows),
    ...spent(rows),
    ...(await workers()),
    ...(plugged.length > 0 ? plugged : [NOTHING_PLUGGED]),
    ...launcherFindings(),
  ]
  for (const { level, text } of findings)
    process.stdout.write(`${painted(level, scrubbed(text))}\n`)
  const count = (wanted: Level): number => findings.filter(({ level }) => level === wanted).length
  const worst: Level = count("FAIL") > 0 ? "FAIL" : count("warn") > 0 ? "warn" : "ok"
  const tally = `${findings.length} checks: ${count("ok")} ok, ${count("warn")} warn, ${count("FAIL")} FAIL`
  process.stdout.write(`\n${marked(TONE[worst], "", tally)}\n`)
  record("doctor", { ok: count("ok"), warn: count("warn"), fail: count("FAIL") })
  offer(findings.flatMap(({ fix }) => fix ?? []))
  return count("FAIL") > 0 ? 1 : 0
}
