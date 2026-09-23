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
import { record } from "../state/log.store.ts"
import { attempt, isRecord, messageOf, parsed, Refusal, real } from "../state/state.store.ts"
import type { Finding, Fix } from "./finding.model.ts"

const MARK = "# ccsaver launcher "
const RUN_TIMEOUT_MS = 15_000
const VERSION_SHAPE = /^\d+\.\d+\.\d+$/
const RELOAD = "a session keeps the version it loaded until /reload-plugins"
const PACKAGE = join(import.meta.dirname, "..", "..", "package.json")
export const PROFILE_LINE = 'export PATH="$HOME/.local/bin:$PATH"'

export const LAUNCHER = String.raw`#!/bin/sh
# ccsaver launcher 1 · written by ccsaver launcher write · removed by: rm -f ~/.local/bin/ccsaver
set -f
IFS=:
for dir in $PATH; do
  [ -n "$dir" ] || dir=.
  if [ -x "$dir/ccsaver" ] && [ -f "$dir/../.claude-plugin/plugin.json" ]; then
    exec "$dir/ccsaver" "$@"
  fi
done
unset IFS
set +f
command -v node >/dev/null 2>&1 || { echo "Error: ccsaver needs node on the PATH, 22.18+ or 24.2+" >&2; exit 1; }
config=$CLAUDE_CONFIG_DIR
[ -n "$config" ] || config=$HOME/.claude
root=$(node -e '
const fs = require("node:fs")
const registry = process.argv[1]
const stop = (text) => { fs.writeSync(2, "Error: " + text + "\n"); process.exit(1) }
const install = "claude plugin install ccsaver@abgonzalez93, or remove this launcher: rm -f ~/.local/bin/ccsaver"
const isRecord = (value) => typeof value === "object" && value !== null
let text
try { text = fs.readFileSync(registry, "utf8") } catch { stop("ccsaver is not installed (no " + registry + "): " + install) }
let raw
try { raw = JSON.parse(text) } catch { stop(registry + " is not JSON, so this launcher cannot tell which ccsaver is installed") }
if (!isRecord(raw) || raw.version !== 2 || !isRecord(raw.plugins)) stop(registry + " has a shape this launcher does not know: run ccsaver from a Claude Code session, and update ccsaver")
const installs = Object.entries(raw.plugins).filter(([id]) => id.startsWith("ccsaver@")).flatMap(([, list]) => (Array.isArray(list) ? list : []))
if (installs.length === 0) stop("ccsaver is not installed: " + install)
const chosen = installs.find((entry) => isRecord(entry) && entry.scope === "user") ?? installs[0]
if (!isRecord(chosen) || typeof chosen.installPath !== "string") stop(registry + ": the ccsaver entry has no installPath this launcher knows")
fs.writeSync(1, chosen.installPath)
' "$config/plugins/installed_plugins.json") || exit 1
[ -x "$root/bin/ccsaver" ] || { echo "Error: the installed ccsaver is gone from $root: claude plugin update ccsaver@abgonzalez93" >&2; exit 1; }
exec "$root/bin/ccsaver" "$@"
`

export type Before = "nothing" | "current" | "older"

export interface Placing {
  place: string
  was: Before
  advice: string[]
}

export const ownVersion = (): string => {
  const raw = parsed(attempt(() => readFileSync(PACKAGE, "utf8")) ?? "")
  return isRecord(raw) && typeof raw["version"] === "string" ? raw["version"] : "unknown"
}

export const launcherPlace = (): string => join(homedir(), ".local", "bin", "ccsaver")

export const isLauncher = (text: string): boolean => text.split("\n")[1]?.startsWith(MARK) === true

const codeOf = (error: unknown): unknown => (isRecord(error) ? error["code"] : undefined)

const cannotWrite = (place: string, error: unknown): Refusal =>
  new Refusal(`${place} cannot be written: ${messageOf(error)}`)

const replaced = (place: string): void => {
  const fresh = `${place}.${process.pid}.new`
  try {
    writeFileSync(fresh, LAUNCHER, { mode: 0o755 })
    chmodSync(fresh, 0o755)
    renameSync(fresh, place)
  } catch (error) {
    throw cannotWrite(place, error)
  }
}

const found = (place: string): Before => {
  const text = attempt(() => readFileSync(place, "utf8"))
  if (text === undefined) throw new Refusal(`${place} is there but cannot be read, nothing written`)
  if (text === LAUNCHER) return "current"
  if (!isLauncher(text))
    throw new Refusal(
      `${place} is not ccsaver's launcher, nothing written: move it away, or keep using it`,
    )
  replaced(place)
  return "older"
}

const placed = (place: string): Before => {
  try {
    mkdirSync(dirname(place), { recursive: true })
    writeFileSync(place, LAUNCHER, { flag: "wx", mode: 0o755 })
    chmodSync(place, 0o755)
  } catch (error) {
    if (codeOf(error) === "EEXIST") return found(place)
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
  const was = placed(place)
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
  if (text !== LAUNCHER)
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
