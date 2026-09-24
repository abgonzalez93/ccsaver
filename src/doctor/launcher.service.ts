import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { ownVersion, record } from "../state/log.store.ts"
import { attempt, codeOf, messageOf, Refusal, real } from "../state/state.store.ts"
import type { Finding, Fix } from "./finding.model.ts"

const MARK = "# ccsaver launcher "
const RUN_TIMEOUT_MS = 15_000
const VERSION_SHAPE = /^\d+\.\d+\.\d+$/
const RELOAD = "a session keeps the version it loaded until /reload-plugins"
export const PROFILE_LINE = 'export PATH="$HOME/.local/bin:$PATH"'

const PIECES = join(import.meta.dirname, "..", "..", "launcher")
const PLACEHOLDER = "__INSTALLED_JS__"

export const launcher = (): string =>
  readFileSync(join(PIECES, "ccsaver.sh"), "utf8").replace(PLACEHOLDER, () =>
    readFileSync(join(PIECES, "installed.js"), "utf8").trimEnd(),
  )

export type Before = "nothing" | "current" | "older"

export interface Placing {
  place: string
  was: Before
  advice: string[]
}

export const launcherPlace = (): string => join(homedir(), ".local", "bin", "ccsaver")

export const isLauncher = (text: string): boolean => text.split("\n")[1]?.startsWith(MARK) === true

const cannotWrite = (place: string, error: unknown): Refusal =>
  new Refusal(`${place} cannot be written: ${messageOf(error)}`)

const replaced = (place: string, text: string): void => {
  const fresh = `${place}.${process.pid}.new`
  try {
    writeFileSync(fresh, text, { mode: 0o755 })
    chmodSync(fresh, 0o755)
    renameSync(fresh, place)
  } catch (error) {
    throw cannotWrite(place, error)
  }
}

const found = (place: string, current: string): Before => {
  const text = attempt(() => readFileSync(place, "utf8"))
  if (text === undefined) throw new Refusal(`${place} is there but cannot be read, nothing written`)
  if (text === current) return "current"
  if (!isLauncher(text))
    throw new Refusal(
      `${place} is not ccsaver's launcher, nothing written: move it away, or keep using it`,
    )
  replaced(place, current)
  return "older"
}

const placed = (place: string, current: string): Before => {
  try {
    mkdirSync(dirname(place), { recursive: true })
    writeFileSync(place, current, { flag: "wx", mode: 0o755 })
    chmodSync(place, 0o755)
  } catch (error) {
    if (codeOf(error) === "EEXIST") return found(place, current)
    throw cannotWrite(place, error)
  }
  return "nothing"
}

const pathEntries = (): string[] => (process.env["PATH"] ?? "").split(":").map((dir) => dir || ".")

const isPluginBin = (dir: string): boolean =>
  existsSync(join(dir, "..", ".claude-plugin", "plugin.json"))

const executable = (path: string): boolean => {
  const stat = attempt(() => statSync(path))
  return stat?.isFile() === true && (stat.mode & 0o111) !== 0
}

export const onPath = (dir: string): boolean => {
  const own = real(dir)
  return pathEntries().some((entry) => real(entry) === own)
}

export const ccsaverAhead = (place: string): string | undefined => {
  const own = real(dirname(place))
  for (const dir of pathEntries()) {
    if (real(dir) === own) return undefined
    const candidate = join(dir, "ccsaver")
    if (!executable(candidate) || isPluginBin(dir)) continue
    const text = attempt(() => readFileSync(candidate, "utf8"))
    if (text === undefined || !isLauncher(text)) return candidate
  }
  return undefined
}

export const pathAdvice = (place: string): string[] => {
  const dir = dirname(place)
  const ahead = ccsaverAhead(place)
  return [
    ...(onPath(dir)
      ? []
      : [`${dir} is not on this PATH; add to your shell profile: ${PROFILE_LINE}`]),
    ...(ahead === undefined
      ? []
      : [`${ahead} comes first on this PATH and is not ccsaver's launcher`]),
  ]
}

export const writeLauncher = (): Placing => {
  const place = launcherPlace()
  const was = placed(place, launcher())
  if (was !== "current") record("config", { action: "launcher", place })
  return { place, was, advice: pathAdvice(place) }
}

const writeFix = (): Fix => ({
  shown: "ccsaver launcher write",
  apply: (): string => {
    const { place, was } = writeLauncher()
    return was === "older" ? `launcher replaced at ${place}` : `launcher written to ${place}`
  },
})

const withoutPluginBins = (): string =>
  pathEntries()
    .filter((dir) => !isPluginBin(dir))
    .join(":")

const ran = (place: string): Finding => {
  const run = spawnSync("sh", [place, "version"], {
    encoding: "utf8",
    timeout: RUN_TIMEOUT_MS,
    env: { ...process.env, PATH: withoutPluginBins() },
  })
  const said = run.stdout.trim()
  if (run.status !== 0 || !VERSION_SHAPE.test(said)) {
    const reason = run.stderr.split("\n")[0] || `exit ${run.status ?? run.signal}`
    return { level: "FAIL", text: `launcher: ${place} says: ${reason}` }
  }
  const own = ownVersion()
  return said === own
    ? { level: "ok", text: `launcher: ${place} runs ${said}` }
    : {
        level: "warn",
        text: `launcher: ${place} runs ${said}, and this doctor is ${own}: ${RELOAD}`,
      }
}

const launcherState = (place: string): Finding => {
  const text = attempt(() => readFileSync(place, "utf8"))
  if (text === undefined)
    return existsSync(place)
      ? { level: "FAIL", text: `launcher: ${place} cannot be read: check its owner and its mode` }
      : {
          level: "warn",
          text: `launcher: none at ${place}, a terminal of yours answers command not found`,
          fix: writeFix(),
        }
  if (!isLauncher(text))
    return { level: "warn", text: `launcher: ${place} is not ccsaver's launcher, left alone` }
  if (text !== launcher())
    return {
      level: "warn",
      text: `launcher: ${place} is an older launcher of ccsaver's`,
      fix: writeFix(),
    }
  return ran(place)
}

const pathFindings = (place: string): Finding[] => {
  const dir = dirname(place)
  const warned = pathAdvice(place).map(
    (text): Finding => ({ level: "warn", text: `path: ${text}` }),
  )
  const found: Finding = { level: "ok", text: `path: ${dir} is on this PATH` }
  return onPath(dir) ? [...warned, found] : warned
}

export const launcherFindings = (): Finding[] => {
  const place = launcherPlace()
  return [launcherState(place), ...pathFindings(place)]
}
