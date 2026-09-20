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

export class Refusal extends Error {}

export const attempt = <T>(run: () => T): T | undefined => {
  try {
    return run()
  } catch (error) {
    if (error instanceof Refusal) throw error
    return undefined
  }
}

export const scrubbed = (text: string): string =>
  text.replace(/\p{Cc}/gu, (char) =>
    char === "\n" || char === "\t"
      ? char
      : `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`,
  )

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === "object" && value !== null

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
  secret = attempt(() => readFileSync(keyFile(), "utf8").trim()) || undefined
  return secret
}

export const storedKey = (): string | undefined => secret ?? readKey()

export const keyIsStored = (): boolean => existsSync(keyFile())

export const keyIsCarriable = (key: string): boolean => CARRIABLE.test(key)

export const pluggedFile = (): string => join(stateHome(), "plugged")

export const workerFile = (): string => join(stateHome(), "worker.json")

export const pricesFile = (): string => join(stateHome(), "prices.json")

export const adaptersDir = (): string => join(stateHome(), "adapters")

const inColour = (): boolean =>
  process.stdout.isTTY === true && !process.env["NO_COLOR"] && process.env["TERM"] !== "dumb"

export const tinted = (text: string, colour: number): string =>
  inColour() ? `\u001b[${colour}m${text}\u001b[0m` : text

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

export const writePrivate = (path: string, text: string): void => {
  const home = stateHome()
  const fresh = `${path}.${process.pid}.new`
  try {
    mkdirSync(home, { recursive: true, mode: 0o700 })
    chmodSync(home, 0o700)
    writeFileSync(fresh, text, { mode: 0o600 })
    chmodSync(fresh, 0o600)
    renameSync(fresh, path)
  } catch (error) {
    throw new Refusal(`${path} cannot be written: ${messageOf(error)}`)
  }
}
