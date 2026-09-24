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
import { readPlugged } from "../state/config.store.ts"
import { ownVersion, record } from "../state/log.store.ts"
import {
  attempt,
  codeOf,
  isRecord,
  messageOf,
  parsed,
  Refusal,
  real,
} from "../state/state.store.ts"
import type { Finding, Fix } from "./finding.reporter.ts"

const MARK = "# ccsaver launcher "
const RUN_TIMEOUT_MS = 15_000
const VERSION_SHAPE = /^\d+\.\d+\.\d+$/
const RELOAD = "a session keeps the version it loaded until /reload-plugins"
const PROFILE_LINE = 'export PATH="$HOME/.local/bin:$PATH"'

const PIECES = join(import.meta.dirname, "..", "..", "launcher")
const PLACEHOLDER = "__INSTALLED_JS__"

const launcher = (): string =>
  readFileSync(join(PIECES, "ccsaver.sh"), "utf8").replace(PLACEHOLDER, () =>
    readFileSync(join(PIECES, "installed.js"), "utf8").trimEnd(),
  )

export type Before = "nothing" | "current" | "older"

export interface Placing {
  place: string
  was: Before
  advice: string[]
}

const launcherPlace = (): string => join(homedir(), ".local", "bin", "ccsaver")

const isLauncher = (text: string): boolean => text.split("\n")[1]?.startsWith(MARK) === true

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

const onPath = (dir: string): boolean => {
  const own = real(dir)
  return pathEntries().some((entry) => real(entry) === own)
}

const ccsaverAhead = (place: string): string | undefined => {
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

const pathAdvice = (place: string): string[] => {
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

const MODES = ["bulk-read", "code-write"]
const RULE = /^Bash\(ccsaver(?: (bulk-read|code-write))?(?: \*|:\*)\)$/
const UNCHECKED = "so the two Bash(ccsaver …) rules could not be checked"

const settingsFiles = (): string[] => {
  const user = join(process.env["CLAUDE_CONFIG_DIR"] || join(homedir(), ".claude"), "settings.json")
  const ofProject = (root: string): string[] =>
    ["settings.json", "settings.local.json"].map((name) => join(root, ".claude", name))
  try {
    return [user, ...readPlugged().flatMap(({ root }) => ofProject(root))]
  } catch {
    return [user]
  }
}

const allowedIn = (file: string): string[] | undefined => {
  const raw = parsed(attempt(() => readFileSync(file, "utf8")) ?? "")
  if (!isRecord(raw)) return undefined
  const allow = isRecord(raw["permissions"]) ? raw["permissions"]["allow"] : undefined
  return Array.isArray(allow)
    ? allow.flatMap((rule) => (typeof rule === "string" ? [rule] : []))
    : []
}

const covers = (rule: string, mode: string): boolean => {
  const found = RULE.exec(rule)
  return found !== null && (found[1] === undefined || found[1] === mode)
}

export const permissionRules = (): Finding => {
  const [user = "", ...ofProjects] = settingsFiles()
  const text = attempt(() => readFileSync(user, "utf8"))
  if (text !== undefined && !isRecord(parsed(text)))
    return { level: "warn", text: `permissions: ${user} is not JSON, ${UNCHECKED}` }
  const held = [user, ...ofProjects].flatMap((file) => {
    const allow = allowedIn(file)
    return allow === undefined ? [] : [{ file, allow }]
  })
  if (held.length === 0)
    return {
      level: "warn",
      text: `permissions: ${user} is not there or cannot be read, ${UNCHECKED}`,
    }
  const where = MODES.map(
    (mode) => held.find(({ allow }) => allow.some((rule) => covers(rule, mode)))?.file,
  )
  const missing = MODES.filter((_, at) => where[at] === undefined)
  if (missing.length === 0)
    return {
      level: "ok",
      text: `permissions: the ccsaver rules are in ${[...new Set(where)].join(" and ")}`,
    }
  const named = missing.map((mode) => `Bash(ccsaver ${mode} *)`).join(" and ")
  const also = held.some(({ file }) => file !== user) ? " nor of a plugged project" : ""
  return {
    level: "warn",
    text: `permissions: ${named} not in permissions.allow of ${user}${also}: Claude asks before every delegation, and refuses one in print mode`,
  }
}
