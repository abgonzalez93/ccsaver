import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, statSync } from "node:fs"
import {
  DEFAULT_LIMITS,
  encrypted,
  keyFile,
  loadAdapter,
  plug,
  readPlugged,
  readWorker,
  setFallback,
  stateHome,
  unplug,
  writeWorker,
} from "./state.ts"
import { CLAUDE_ON_PATH, claudeBin, isMode, runWorker } from "./worker.ts"

const USAGE = `usage: ccsaver <command>

  plug <dir> [adapter]      turn ccsaver on for one project
  unplug <dir>              turn it off again
  list                      show the plugged projects
  worker set <url> <model>  point at an OpenAI-compatible chat completions endpoint
  key set                   store the API key (typed on the terminal, never an argument)
  fallback on|off           whether a call the worker cannot take goes to paid Claude Haiku
  doctor                    check permissions, key, worker, fallback and projects

  bulk-read  --question <q> --paths <file>... [--project <dir>]
  code-write --spec <s> --reference <file>... [--target <out>] [--project <dir>]
`

const PROBE_TIMEOUT_MS = 30_000

type Level = "ok" | "warn" | "FAIL"

interface Finding {
  level: Level
  text: string
}

const NOTHING_PLUGGED: Finding = { level: "warn", text: "plugged: nothing" }

const modeOf = (path: string): number | undefined => {
  try {
    return statSync(path).mode & 0o777
  } catch {
    return undefined
  }
}

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
      body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
    })
    const took = `${Math.round(performance.now() - started)} ms`
    if (response.status === 200)
      return { level: "ok", text: `probe: ${model} accepted the key in ${took}` }
    return response.status === 401 || response.status === 403
      ? { level: "FAIL", text: `probe: the key was rejected (${response.status})` }
      : { level: "FAIL", text: `probe: ${model} answered ${response.status} in ${took}` }
  } catch {
    return { level: "FAIL", text: `probe: ${url} is unreachable` }
  }
}

const external = async (): Promise<Finding[]> => {
  const worker = readWorker()
  if (worker === undefined)
    return [{ level: "warn", text: "worker: not configured, every delegation uses the fallback" }]
  if (!encrypted(worker.url)) return [{ level: "FAIL", text: "worker: the url is not https" }]
  const configured: Finding = { level: "ok", text: `worker: ${worker.url} · ${worker.model}` }
  const key = ((): string => {
    try {
      return readFileSync(keyFile(), "utf8").trim()
    } catch {
      return ""
    }
  })()
  if (key === "") return [configured, { level: "FAIL", text: "key: missing, run: ccsaver key set" }]
  return [
    configured,
    permissions("key", keyFile(), 0o600),
    await probe(worker.url, worker.model, key),
  ]
}

const fallback = (): Finding => {
  if (readWorker()?.fallback === false)
    return {
      level: "ok",
      text: "fallback: off, a call the worker cannot take fails instead of going to Claude Haiku",
    }
  const bin = claudeBin()
  const run = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15_000 })
  if (run.status === 0) return { level: "ok", text: `fallback: ${bin} (${run.stdout.trim()})` }
  return bin === CLAUDE_ON_PATH && process.env["CLAUDE_CODE_CHILD_SESSION"] !== "1"
    ? {
        level: "warn",
        text: "fallback: claude does not run from this shell; a Claude Code session brings its own binary, so run doctor from inside one",
      }
    : { level: "FAIL", text: `fallback: ${bin} does not run; set "claude" in worker.json` }
}

const projects = (): Finding[] =>
  readPlugged().map(({ root, adapter }) => {
    if (!existsSync(root)) return { level: "warn", text: `plugged: ${root} no longer exists` }
    try {
      const limits = { ...DEFAULT_LIMITS, ...(adapter === undefined ? {} : loadAdapter(adapter)) }
      return {
        level: "ok",
        text: `plugged: ${root} · adapter ${adapter ?? "none"} · reads over ${limits.maxLines} lines or ${limits.maxTokens} tokens are denied`,
      }
    } catch (error) {
      return {
        level: "FAIL",
        text: `plugged: ${root} · ${error instanceof Error ? error.message : "broken adapter"}`,
      }
    }
  })

const doctor = async (): Promise<number> => {
  const plugged = projects()
  const findings = [
    permissions("state", stateHome(), 0o700),
    ...(await external()),
    fallback(),
    ...(plugged.length > 0 ? plugged : [NOTHING_PLUGGED]),
  ]
  for (const { level, text } of findings) process.stdout.write(`${level.padEnd(4)} ${text}\n`)
  return findings.some(({ level }) => level === "FAIL") ? 1 : 0
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
      if (first !== "set" || second === undefined || third === undefined) break
      writeWorker(second, third)
      process.stdout.write(`worker set to ${second} · ${third}\n`)
      return 0
    }
    case "fallback": {
      if (first !== "on" && first !== "off") break
      setFallback(first === "on")
      process.stdout.write(`fallback ${first}\n`)
      return 0
    }
    case "key":
      process.stderr.write("Error: run the ccsaver launcher (bin/ccsaver key set)\n")
      return 1
    case "doctor":
      return doctor()
    default:
      break
  }
  process.stderr.write(USAGE)
  return command === undefined || command === "help" || command === "--help" ? 0 : 1
}

try {
  process.exitCode = await main()
} catch (error) {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
