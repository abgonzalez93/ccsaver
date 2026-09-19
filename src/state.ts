import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

interface Plugged {
  root: string
  adapter?: string
}

export interface Worker {
  url: string
  model: string
  claude?: string
  fallback?: boolean
}

export interface Adapter {
  rules?: string
  format?: string[]
  after?: string[]
  maxLines?: number
  maxTokens?: number
}

export const DEFAULT_LIMITS = { maxLines: 350, maxTokens: 8000 } as const

const ADAPTER_KEYS = ["rules", "format", "after", "maxLines", "maxTokens"]
const ADAPTER_NAME = /^[a-z0-9][a-z0-9-]*$/
const LINE_BREAKERS = /[\t\n\r]/
const LOG_VERSION = 1
const LOG_LINE_BYTES = 4000
const SCRUB_FROM = 8

let secret: string | undefined

export const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0

export const stateHome = (): string =>
  process.env["CCSAVER_HOME"] || join(homedir(), ".config", "ccsaver")

export const keyFile = (): string => join(stateHome(), "api-key")

export const readKey = (): string | undefined => {
  try {
    secret = readFileSync(keyFile(), "utf8").trim() || undefined
    return secret
  } catch {
    return undefined
  }
}

const pluggedFile = (): string => join(stateHome(), "plugged")

const workerFile = (): string => join(stateHome(), "worker.json")

export const real = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

export const isUnder = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`)

export const encrypted = (url: string): boolean => {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === "https:" || hostname === "127.0.0.1" || hostname === "localhost"
  } catch {
    return false
  }
}

const writePrivate = (path: string, text: string): void => {
  mkdirSync(stateHome(), { recursive: true, mode: 0o700 })
  chmodSync(stateHome(), 0o700)
  const fresh = `${path}.${process.pid}.new`
  writeFileSync(fresh, text, { mode: 0o600 })
  chmodSync(fresh, 0o600)
  renameSync(fresh, path)
}

export const logDir = (): string => join(stateHome(), "log")

export const logFile = (now = new Date()): string =>
  join(logDir(), `events-${now.toISOString().slice(0, 7)}.jsonl`)

export const record = (kind: string, fields: Record<string, unknown>, session?: unknown): void => {
  try {
    const now = new Date()
    const head = {
      v: LOG_VERSION,
      ts: now.toISOString(),
      kind,
      session:
        typeof session === "string" ? session : process.env["CLAUDE_CODE_SESSION_ID"] || null,
      pid: process.pid,
    }
    const full = JSON.stringify({ ...head, ...fields })
    const line =
      Buffer.byteLength(full) > LOG_LINE_BYTES
        ? JSON.stringify({ ...head, dropped: Buffer.byteLength(full) })
        : full
    const known = secret !== undefined && secret.length >= SCRUB_FROM ? secret : undefined
    const clean =
      known === undefined ? line : line.replaceAll(JSON.stringify(known).slice(1, -1), "[key]")
    appendFileSync(logFile(now), `${clean}\n`, { mode: 0o600 })
  } catch {
    // the folder is the switch: without it the append fails and nothing else changes
  }
}

export const crashed = (where: string, error: unknown): void => {
  record(
    "crash",
    error instanceof Error
      ? {
          where,
          name: error.name,
          message: error.message,
          stack: (error.stack ?? "").split("\n").slice(1, 6),
        }
      : { where, message: String(error) },
  )
}

export const setLog = (on: boolean): void => {
  const dir = logDir()
  const aside = `${dir}.off`
  if (on) {
    if (!existsSync(dir) && existsSync(aside)) renameSync(aside, dir)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    chmodSync(dir, 0o700)
  } else if (existsSync(dir) && existsSync(aside))
    throw new Error(`${aside} already exists: move it away, then run ccsaver log off again`)
  record("config", { action: "log", on })
  if (!on && existsSync(dir)) renameSync(dir, aside)
}

export const readPlugged = (): Plugged[] => {
  try {
    return readFileSync(pluggedFile(), "utf8")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [root = "", adapter] = line.split("\t")
        return adapter ? { root, adapter } : { root }
      })
      .filter(({ root }) => root.startsWith("/") && root !== "/")
  } catch {
    return []
  }
}

const writePlugged = (entries: Plugged[]): void => {
  writePrivate(
    pluggedFile(),
    entries.map(({ root, adapter }) => `${root}\t${adapter ?? ""}\n`).join(""),
  )
}

export const pluggedRootOf = (path: string): Plugged | undefined => {
  const target = real(path)
  return readPlugged()
    .filter(({ root }) => isUnder(target, root))
    .sort((a, b) => b.root.length - a.root.length)[0]
}

const adapterOf = (raw: unknown): Adapter | undefined => {
  if (!isRecord(raw) || !Object.keys(raw).every((key) => ADAPTER_KEYS.includes(key)))
    return undefined
  const { rules, format, after, maxLines, maxTokens } = raw
  if (rules !== undefined && typeof rules !== "string") return undefined
  if (format !== undefined && !(isStrings(format) && format.length > 0)) return undefined
  if (after !== undefined && !isStrings(after)) return undefined
  if (maxLines !== undefined && !isCount(maxLines)) return undefined
  if (maxTokens !== undefined && !isCount(maxTokens)) return undefined
  return {
    ...(typeof rules === "string" ? { rules } : {}),
    ...(isStrings(format) ? { format } : {}),
    ...(isStrings(after) ? { after } : {}),
    ...(isCount(maxLines) ? { maxLines } : {}),
    ...(isCount(maxTokens) ? { maxTokens } : {}),
  }
}

export const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export const loadAdapter = (name: string): Adapter => {
  if (!ADAPTER_NAME.test(name)) throw new Error(`invalid adapter name: ${name}`)
  const places = [
    join(stateHome(), "adapters", `${name}.json`),
    join(import.meta.dirname, "..", "adapters", `${name}.json`),
  ]
  for (const place of places) {
    const text = ((): string | undefined => {
      try {
        return readFileSync(place, "utf8")
      } catch {
        return undefined
      }
    })()
    if (text === undefined) continue
    const adapter = adapterOf(parsed(text))
    if (adapter === undefined) throw new Error(`adapter ${name} is malformed: ${place}`)
    return adapter
  }
  throw new Error(`adapter ${name} not found in ${places.join(" or ")}`)
}

export const plug = (dir: string, adapter?: string): Plugged => {
  const root = ((): string => {
    try {
      const found = realpathSync(dir)
      return statSync(found).isDirectory() ? found : ""
    } catch {
      return ""
    }
  })()
  if (root === "") throw new Error(`not a directory: ${dir}`)
  if (LINE_BREAKERS.test(root))
    throw new Error("a root with a tab or a line break cannot be stored")
  if (root === "/" || isUnder(real(homedir()), root) || isUnder(real(stateHome()), root))
    throw new Error(`refusing to plug ${root}: it would expose far more than one project`)
  if (adapter !== undefined) loadAdapter(adapter)
  const entry: Plugged = adapter === undefined ? { root } : { root, adapter }
  writePlugged([...readPlugged().filter((other) => other.root !== root), entry])
  record("config", { action: "plug", root, adapter: adapter ?? null })
  return entry
}

export const unplug = (dir: string): boolean => {
  const names = [real(dir), resolve(dir)]
  const before = readPlugged()
  const after = before.filter(({ root }) => !names.includes(root))
  if (after.length === before.length) return false
  writePlugged(after)
  record("config", { action: "unplug", root: names[0] })
  return true
}

export const readWorker = (): Worker | undefined => {
  try {
    const raw: unknown = JSON.parse(readFileSync(workerFile(), "utf8"))
    if (!isRecord(raw) || typeof raw["url"] !== "string" || typeof raw["model"] !== "string")
      return undefined
    const { claude, fallback } = raw
    return {
      url: raw["url"],
      model: raw["model"],
      ...(typeof claude === "string" && claude.length > 0 ? { claude } : {}),
      ...(typeof fallback === "boolean" ? { fallback } : {}),
    }
  } catch {
    return undefined
  }
}

const storeWorker = (worker: Worker): void => {
  writePrivate(workerFile(), `${JSON.stringify(worker, null, 2)}\n`)
}

export const writeWorker = (url: string, model: string): void => {
  if (!encrypted(url)) throw new Error("the worker url must be https (localhost excepted)")
  if (model.length === 0) throw new Error("the worker model is required")
  storeWorker({ ...readWorker(), url, model })
  record("config", { action: "worker set", host: new URL(url).host, model })
}

export const setFallback = (on: boolean): void => {
  const worker = readWorker()
  if (worker === undefined) {
    if (on) return
    throw new Error("set a worker first: without one the fallback is the only worker")
  }
  storeWorker({ ...worker, fallback: on })
  record("config", { action: "fallback", on })
}
