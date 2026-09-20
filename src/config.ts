import { chmodSync, mkdirSync, readFileSync, realpathSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { record } from "./log.ts"
import {
  attempt,
  isEncrypted,
  isRecord,
  isSecretPlace,
  isUnder,
  parsed,
  pluggedFile,
  Refusal,
  readKey,
  real,
  stateHome,
  workerFile,
  writePrivate,
} from "./state.ts"

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

export interface Limits {
  maxLines: number
  maxTokens: number
}

export const DEFAULT_LIMITS = { maxLines: 350, maxTokens: 8000 } as const

export const BYTES_PER_TOKEN = 4

const ADAPTER_KEYS = ["rules", "format", "after", "maxLines", "maxTokens"]
const ADAPTER_NAME = /^[a-z0-9][a-z0-9-]*$/
const LINE_BREAKERS = /[\t\n\r]/

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0

export const readPlugged = (): Plugged[] =>
  (attempt(() => readFileSync(pluggedFile(), "utf8")) ?? "")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): Plugged => {
      const [root = "", adapter] = line.split("\t")
      return adapter ? { root, adapter } : { root }
    })
    .filter(({ root }) => root.startsWith("/") && root !== "/")

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

const adapterPlace = (name: string): string => join(stateHome(), "adapters", `${name}.json`)

export const loadAdapter = (name: string): Adapter => {
  if (!ADAPTER_NAME.test(name)) throw new Refusal(`invalid adapter name: ${name}`)
  const places = [adapterPlace(name), join(import.meta.dirname, "..", "adapters", `${name}.json`)]
  for (const place of places) {
    const text = attempt(() => readFileSync(place, "utf8"))
    if (text === undefined) continue
    const adapter = adapterOf(parsed(text))
    if (adapter === undefined) throw new Refusal(`adapter ${name} is malformed: ${place}`)
    return adapter
  }
  throw new Refusal(`adapter ${name} not found in ${places.join(" or ")}`)
}

export const writeLimits = (name: string, limits: Partial<Limits>): string => {
  if (!ADAPTER_NAME.test(name)) throw new Refusal(`invalid adapter name: ${name}`)
  const before = attempt(() => loadAdapter(name)) ?? {}
  const after: Adapter = { ...before, ...limits }
  const place = adapterPlace(name)
  mkdirSync(dirname(place), { recursive: true, mode: 0o700 })
  chmodSync(dirname(place), 0o700)
  writePrivate(place, `${JSON.stringify(after, null, 2)}\n`)
  record("config", { action: "adapter limits", adapter: name, ...limits })
  return place
}

export const limitsFor = (adapter: string | undefined): Limits => ({
  ...DEFAULT_LIMITS,
  ...(adapter === undefined ? {} : loadAdapter(adapter)),
})

export const plug = (dir: string, adapter?: string): Plugged => {
  const root = attempt(() => realpathSync.native(dir))
  if (root === undefined || attempt(() => statSync(root).isDirectory()) !== true)
    throw new Refusal(`not a directory: ${dir}`)
  if (LINE_BREAKERS.test(root))
    throw new Refusal("a root with a tab or a line break cannot be stored")
  if (root === "/" || isUnder(real(homedir()), root) || isUnder(real(stateHome()), root))
    throw new Refusal(`refusing to plug ${root}: it would expose far more than one project`)
  if (isSecretPlace(basename(root)))
    throw new Refusal(`refusing to plug ${root}: it is a place where credentials live`)
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
  const text = attempt(() => readFileSync(workerFile(), "utf8"))
  if (text === undefined) return undefined
  const raw = parsed(text)
  const { url, model, claude, fallback } = isRecord(raw) ? raw : {}
  if (
    typeof url !== "string" ||
    typeof model !== "string" ||
    (claude !== undefined && typeof claude !== "string") ||
    (fallback !== undefined && typeof fallback !== "boolean")
  )
    throw new Refusal(`${workerFile()} is malformed: fix it or delete it, nothing was sent`)
  return {
    url,
    model,
    ...(claude ? { claude } : {}),
    ...(fallback === undefined ? {} : { fallback }),
  }
}

const storeWorker = (worker: Worker): void => {
  writePrivate(workerFile(), `${JSON.stringify(worker, null, 2)}\n`)
}

export const writeWorker = (url: string, model: string): string | undefined => {
  if (!isEncrypted(url)) throw new Refusal("the worker url must be https (localhost excepted)")
  if (model.length === 0) throw new Refusal("the worker model is required")
  const parts = new URL(url)
  if (parts.username !== "" || parts.password !== "")
    throw new Refusal(
      "the worker url must carry no user name or password: fetch refuses one, and the key belongs in ccsaver key set",
    )
  const before = readWorker()
  const host = parts.host
  storeWorker({ ...before, url, model })
  record("config", { action: "worker set", host, model })
  if (before === undefined || readKey() === undefined) return undefined
  const old = attempt(() => new URL(before.url).host)
  return old === host
    ? undefined
    : `the worker moved from ${old ?? "another host"} to ${host} and the stored key stays: run ccsaver key set unless the key belongs to ${host}`
}

export const setFallback = (on: boolean): void => {
  const worker = readWorker()
  if (worker === undefined) {
    if (on) return
    throw new Refusal("set a worker first: without one the fallback is the only worker")
  }
  storeWorker({ ...worker, fallback: on })
  record("config", { action: "fallback", on })
}

export const setClaude = (path: string | undefined): string | undefined => {
  const worker = readWorker()
  if (worker === undefined)
    throw new Refusal("set a worker first: ccsaver worker set <url> <model>")
  const claude = path === undefined ? undefined : resolve(path)
  if (claude !== undefined && attempt(() => statSync(claude).isFile()) !== true)
    throw new Refusal(`not a file: ${path}`)
  storeWorker({
    url: worker.url,
    model: worker.model,
    ...(claude === undefined ? {} : { claude }),
    ...(worker.fallback === undefined ? {} : { fallback: worker.fallback }),
  })
  record("config", { action: "worker claude", pinned: claude !== undefined })
  return claude
}
