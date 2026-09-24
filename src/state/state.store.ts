import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const SECRET_PLACE =
  /(^|\/)(\.?secrets?|\.ssh|\.aws|\.gnupg|\.kube|\.git)(\/|$)|(^|\/)\.docker\/config\.json$/i
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"]
const CARRIABLE = /^[\x20-\x7e]+$/

let secret: string | undefined
let looked = false

export class Refusal extends Error {}

export const attempt = <T>(run: () => T): T | undefined => {
  try {
    return run()
  } catch (error) {
    if (error instanceof Refusal) throw error
    return undefined
  }
}

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null

export const codeOf = (error: unknown): unknown => (isRecord(error) ? error["code"] : undefined)

export const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

export const parsed = (text: string): unknown => attempt<unknown>(() => JSON.parse(text))

export const stateHome = (): string => {
  const given = process.env["CCSAVER_HOME"]
  if (!given) return join(homedir(), ".config", "ccsaver")
  if (!given.startsWith("/"))
    throw new Refusal(`CCSAVER_HOME must be an absolute path, this one is not: ${given}`)
  return given
}

export const keyFile = (): string => join(stateHome(), "api-key")

export const readKey = (): string | undefined => {
  looked = true
  secret = attempt(() => readFileSync(keyFile(), "utf8").trim()) || undefined
  return secret
}

const storedKey = (): string | undefined => (looked ? secret : readKey())

export const keyIsStored = (): boolean => existsSync(keyFile())

export const movedKeyFile = (): string => `${keyFile()}.moved`

export const keyWasMoved = (): boolean => !existsSync(keyFile()) && existsSync(movedKeyFile())

export const keyIsCarriable = (key: string): boolean => CARRIABLE.test(key)

const SCRUB_FROM = 8

export const hidden = (text: string): string => {
  const known = storedKey()
  if (known === undefined || known.length < SCRUB_FROM) return text
  return text.replaceAll(known, "[key]").replaceAll(JSON.stringify(known).slice(1, -1), "[key]")
}

export const pluggedFile = (): string => join(stateHome(), "plugged")

export const workerFile = (): string => join(stateHome(), "worker.json")

export const pricesFile = (): string => join(stateHome(), "prices.json")

export const adaptersDir = (): string => join(stateHome(), "adapters")

export const real = (path: string): string =>
  attempt(() => realpathSync.native(path)) ?? resolve(path)

export const isSecretPlace = (place: string): boolean => SECRET_PLACE.test(place)

export const isUnder = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`)

export const isEncrypted = (url: string): boolean => {
  const parts = attempt(() => new URL(url))
  if (parts === undefined) return false
  return (
    parts.protocol === "https:" ||
    (parts.protocol === "http:" && LOCAL_HOSTS.includes(parts.hostname))
  )
}

export const privateDir = (path: string): void => {
  mkdirSync(path, { recursive: true, mode: 0o700 })
  chmodSync(path, 0o700)
}

export const writePrivate = (path: string, text: string): void => {
  const fresh = `${path}.${process.pid}.new`
  try {
    privateDir(stateHome())
    writeFileSync(fresh, text, { mode: 0o600 })
    chmodSync(fresh, 0o600)
    renameSync(fresh, path)
  } catch (error) {
    throw new Refusal(`${path} cannot be written: ${messageOf(error)}`)
  }
}
