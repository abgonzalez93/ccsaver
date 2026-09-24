import {
  chmodSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs"
import { homedir } from "node:os"
import { basename, join, resolve } from "node:path"
import { record } from "./log.store.ts"
import {
  adaptersDir,
  attempt,
  isRecord,
  isSecretPlace,
  isUnder,
  parsed,
  pluggedFile,
  Refusal,
  real,
  stateHome,
  writePrivate,
} from "./state.store.ts"

export interface Plugged {
  root: string
  adapter?: string
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

export const LIMIT_CEILING = 1_000_000

export const SCAN_CEILING = 1_000_000

const LINE_BREAK = 10
const NUL = 0

export const HEAD_BYTES = 8192

export const tokensIn = (bytes: number): number => Math.round(bytes / BYTES_PER_TOKEN)

export const isBinary = (bytes: Buffer): boolean => bytes.includes(NUL)

export const headOf = (path: string): Buffer | undefined => {
  const fd = attempt(() => openSync(path, "r"))
  if (fd === undefined) return undefined
  const head = Buffer.alloc(HEAD_BYTES)
  const read = attempt(() => readSync(fd, head, 0, HEAD_BYTES, 0))
  attempt(() => closeSync(fd))
  return read === undefined ? undefined : head.subarray(0, read)
}

export const tailOf = (path: string, bytes: number): Buffer | undefined => {
  const fd = attempt(() => openSync(path, "r"))
  if (fd === undefined) return undefined
  const size = attempt(() => fstatSync(fd).size) ?? 0
  const tail = Buffer.alloc(Math.min(bytes, size))
  const read = attempt(() => readSync(fd, tail, 0, tail.length, Math.max(0, size - bytes)))
  attempt(() => closeSync(fd))
  return read === undefined ? undefined : tail.subarray(0, read)
}

export interface Spoken {
  model: string | undefined
  context: number | undefined
}

const SYNTHETIC = "<synthetic>"
const CONTEXT_PARTS = ["input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"]

const contextOf = (usage: unknown): number | undefined => {
  if (!isRecord(usage) || typeof usage["input_tokens"] !== "number") return undefined
  return CONTEXT_PARTS.reduce((sum, part) => {
    const held = usage[part]
    return sum + (typeof held === "number" ? held : 0)
  }, 0)
}

const spokenIn = (text: string): Spoken | undefined => {
  let said: Spoken | undefined
  for (const line of text.split("\n")) {
    const row = parsed(line)
    if (!isRecord(row) || row["isSidechain"] === true) continue
    const message = row["message"]
    if (!isRecord(message) || message["role"] !== "assistant") continue
    const model = message["model"]
    if (model === SYNTHETIC) continue
    said = {
      model: typeof model === "string" ? model : undefined,
      context: contextOf(message["usage"]),
    }
  }
  return said
}

const NEAR_TAIL = 16_384

const spokenAt = (transcript: string, bytes: number): Spoken | undefined => {
  const tail = tailOf(transcript, bytes)
  return tail === undefined ? undefined : spokenIn(tail.toString("utf8"))
}

export const lastAssistantOf = (transcript: unknown, bytes: number): Spoken | undefined => {
  if (typeof transcript !== "string") return undefined
  if (bytes <= NEAR_TAIL) return spokenAt(transcript, bytes)
  return spokenAt(transcript, NEAR_TAIL) ?? spokenAt(transcript, bytes)
}

export const linesIn = (bytes: Buffer): number => {
  let lines = bytes.length > 0 && bytes.at(-1) !== LINE_BREAK ? 1 : 0
  for (let at = bytes.indexOf(LINE_BREAK); at !== -1; at = bytes.indexOf(LINE_BREAK, at + 1))
    lines += 1
  return lines
}

const ADAPTER_KEYS = ["rules", "format", "after", "maxLines", "maxTokens"]
const ADAPTER_NAME = /^[a-z0-9][a-z0-9-]*$/
const LINE_BREAKERS = /[\t\n\r]/

const isStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string")

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= LIMIT_CEILING

export const readPlugged = (): Plugged[] => {
  const text = attempt(() => readFileSync(pluggedFile(), "utf8"))
  if (text === undefined && existsSync(pluggedFile()))
    throw new Refusal(
      `${pluggedFile()} cannot be read: check its owner and its mode, nothing was changed`,
    )
  return (text ?? "")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): Plugged => {
      const [root = "", adapter] = line.split("\t")
      return adapter ? { root, adapter } : { root }
    })
    .filter(({ root }) => root.startsWith("/") && root !== "/")
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

const fieldsHold = (raw: Record<PropertyKey, unknown>): boolean => {
  const { rules, format, after, maxLines, maxTokens } = raw
  return (
    (rules === undefined || typeof rules === "string") &&
    (format === undefined || (isStrings(format) && format.length > 0)) &&
    (after === undefined || isStrings(after)) &&
    (maxLines === undefined || isCount(maxLines)) &&
    (maxTokens === undefined || isCount(maxTokens))
  )
}

const adapterOf = (raw: unknown): Adapter | undefined => {
  if (!isRecord(raw) || Array.isArray(raw)) return undefined
  if (!Object.keys(raw).every((key) => ADAPTER_KEYS.includes(key)) || !fieldsHold(raw))
    return undefined
  const { rules, format, after, maxLines, maxTokens } = raw
  return {
    ...(typeof rules === "string" ? { rules } : {}),
    ...(isStrings(format) ? { format } : {}),
    ...(isStrings(after) ? { after } : {}),
    ...(isCount(maxLines) ? { maxLines } : {}),
    ...(isCount(maxTokens) ? { maxTokens } : {}),
  }
}

const adapterPlace = (name: string): string => join(adaptersDir(), `${name}.json`)

const adapterPlaces = (name: string): string[] => {
  if (!ADAPTER_NAME.test(name))
    throw new Refusal(`an adapter name takes lowercase letters, digits and dashes; not: ${name}`)
  return [adapterPlace(name), join(import.meta.dirname, "..", "..", "adapters", `${name}.json`)]
}

const findAdapter = (name: string, places: string[]): Adapter | undefined => {
  for (const place of places) {
    const text = attempt(() => readFileSync(place, "utf8"))
    if (text === undefined) {
      if (existsSync(place)) throw new Refusal(`adapter ${name} cannot be read: ${place}`)
      continue
    }
    const adapter = adapterOf(parsed(text))
    if (adapter === undefined) throw new Refusal(`adapter ${name} is malformed: ${place}`)
    return adapter
  }
  return undefined
}

export const loadAdapter = (name: string): Adapter => {
  const places = adapterPlaces(name)
  const adapter = findAdapter(name, places)
  if (adapter === undefined)
    throw new Refusal(
      `adapter ${name} not found in ${places.join(" or ")}, create it with: ccsaver adapter ${name} maxLines=<n>`,
    )
  return adapter
}

export interface Written {
  place: string
  changed: boolean
}

export const writeLimits = (name: string, limits: Partial<Limits>): Written => {
  const before = findAdapter(name, adapterPlaces(name)) ?? {}
  const after: Adapter = { ...before, ...limits }
  const place = adapterPlace(name)
  if (JSON.stringify(after) === JSON.stringify(before)) return { place, changed: false }
  mkdirSync(adaptersDir(), { recursive: true, mode: 0o700 })
  chmodSync(adaptersDir(), 0o700)
  writePrivate(place, `${JSON.stringify(after, null, 2)}\n`)
  record("config", { action: "adapter limits", adapter: name, ...limits })
  return { place, changed: true }
}

export const limitsFrom = ({ maxLines, maxTokens }: Adapter): Limits => ({
  maxLines: maxLines ?? DEFAULT_LIMITS.maxLines,
  maxTokens: maxTokens ?? DEFAULT_LIMITS.maxTokens,
})

export const limitsFor = (adapter: string | undefined): Limits =>
  limitsFrom(adapter === undefined ? {} : loadAdapter(adapter))

export interface Plugging {
  entry: Plugged
  was: Plugged | undefined
}

export const plug = (dir: string, adapter?: string): Plugging => {
  const root = attempt(() => realpathSync.native(dir))
  if (root === undefined || attempt(() => statSync(root).isDirectory()) !== true)
    throw new Refusal(`not a directory: ${dir}`)
  if (LINE_BREAKERS.test(root))
    throw new Refusal(`a root with a tab or a line break cannot be stored: ${JSON.stringify(root)}`)
  if (root === "/" || isUnder(real(homedir()), root) || isUnder(real(stateHome()), root))
    throw new Refusal(`refusing to plug ${root}: it would expose far more than one project`)
  if (isSecretPlace(basename(root)))
    throw new Refusal(`refusing to plug ${root}: it is a place where credentials live`)
  if (adapter !== undefined) loadAdapter(adapter)
  const entry: Plugged = adapter === undefined ? { root } : { root, adapter }
  const before = readPlugged()
  const was = before.find((other) => other.root === root)
  if (was !== undefined && was.adapter === adapter) return { entry, was }
  writePlugged([...before.filter((other) => other.root !== root), entry])
  record("config", { action: "plug", root, adapter: adapter ?? null })
  return { entry, was }
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
