import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { attempt, isRecord, messageOf, parsed } from "../src/state/state.store.ts"

type Level = "major" | "minor" | "patch"

interface Edit {
  path: string
  now: string
  next: string
}

const MANIFESTS = ["package.json", ".claude-plugin/plugin.json"]
const CHANGELOG = "CHANGELOG.md"
const VERSION_LINE = /^(\s*"version":\s*")[^"]*(")/m
const REPAIR = "git rebase --exec 'node scripts/version.hook.ts' HEAD~<commits>"
const AMEND = ["-c", "core.hooksPath=/dev/null", "commit", "--amend", "--no-edit", "--quiet", "--"]

export const levelOf = (message: string): Level => {
  const [, type, bang] = /^([a-z]+)(?:\([^)]*\))?(!)?: /.exec(message) ?? []
  if (bang !== undefined || /^BREAKING[ -]CHANGE: /m.test(message)) return "major"
  return type === "feat" ? "minor" : "patch"
}

export const bump = (version: string, level: Level): string => {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map(Number)
  if (level === "major" && major > 0) return `${major + 1}.0.0`
  return level === "patch" ? `${major}.${minor}.${patch + 1}` : `${major}.${minor + 1}.0`
}

export const sectionOf = (version: string, date: string, message: string): string => {
  const [subject = "", ...body] = message.trim().split("\n")
  const bullets = body.filter((line) => /^(- | {2,}\S)/.test(line)).join("\n")
  return [`## ${version} - ${date}`, subject, bullets].filter((part) => part !== "").join("\n\n")
}

const sectionsStart = (text: string): number => {
  const at = text.search(/^## /m)
  return at === -1 ? text.length : at
}

export const changelogOf = (mine: string, parent: string, section: string): string => {
  const intro = mine.slice(0, sectionsStart(mine)).trimEnd()
  const released = parent
    .slice(sectionsStart(parent))
    .replace(/^## Unreleased\n+/, "")
    .trimEnd()
  const parts = [intro, section, released].filter((part) => part !== "")
  return `${parts.join("\n\n")}\n`
}

const versionOf = (text: string): string | undefined => {
  const raw = parsed(text)
  const version = isRecord(raw) ? raw["version"] : undefined
  return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version : undefined
}

const git = (...args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })

const committed = (path: string, commit = "HEAD"): string | undefined =>
  attempt(() => git("show", `${commit}:${path}`))

const midway = (): boolean => {
  const places = git(
    "rev-parse",
    "--git-path",
    "CHERRY_PICK_HEAD",
    "--git-path",
    "rebase-apply/last",
  )
  const [pick = "", last = ""] = places.split("\n")
  return existsSync(pick) || Number(attempt(() => readFileSync(last, "utf8")) ?? 1) > 1
}

const amended = (edits: Edit[]): string => {
  const paths = edits.map(({ path }) => path)
  for (const { path, next } of edits) writeFileSync(path, next)
  try {
    git(...AMEND, ...paths)
  } catch (error) {
    git("checkout", "--", ...paths)
    throw error
  }
  return git("rev-parse", "--short", "HEAD").trim()
}

const unreachable = (tag: string): boolean =>
  attempt(() => git("merge-base", "--is-ancestor", `${tag}^{commit}`, "HEAD")) === undefined

const tagged = (after: string, carried: string | undefined): string => {
  if (carried !== undefined && carried !== after && unreachable(`v${carried}`))
    attempt(() => git("tag", "--delete", `v${carried}`))
  git("tag", "--force", "--annotate", "--message", `ccsaver ${after}`, `v${after}`, "HEAD")
  return `v${after}`
}

const changed = ({ now, next }: Edit): boolean => now !== next

const editsFor = (after: string, section: string): Edit[] =>
  [...MANIFESTS, CHANGELOG]
    .flatMap((path): Edit[] => {
      const now = committed(path)
      if (now === undefined) return []
      if (path !== CHANGELOG)
        return [{ path, now, next: now.replace(VERSION_LINE, `$1${after}$2`) }]
      return [{ path, now, next: changelogOf(now, committed(path, "HEAD~1") ?? "", section) }]
    })
    .filter(changed)

const versioned = (): string | undefined => {
  const [parents = "", date = "", ...lines] = git("log", "-1", "--format=%P%n%as%n%B").split("\n")
  const message = lines.join("\n")
  if (parents === "") return undefined
  if (parents.includes(" ")) return "a merge commit gets no version: keep the history linear"
  const before = versionOf(committed("package.json", "HEAD~1") ?? "")
  if (before === undefined) return "the parent commit carries no version, nothing to bump"
  const after = bump(before, levelOf(message))
  const carried = versionOf(committed("package.json") ?? "")
  const stale = editsFor(after, sectionOf(after, date, message))
  if (midway())
    return stale.length === 0
      ? undefined
      : `${after} not written in the middle of a pick or a patch series; then: ${REPAIR}`
  if (stale.length === 0) return `${after} already written, ${tagged(after, carried)} moved here`
  const dirty = git("status", "--porcelain", "--", ...stale.map(({ path }) => path)).trim()
  if (dirty !== "")
    return `${after} not written, changed outside the commit: ${dirty.replaceAll("\n", ",")}`
  const at = amended(stale)
  return `${after}, amended as ${at}, tagged ${tagged(after, carried)}`
}

const outcome = (): string | undefined => {
  try {
    return versioned()
  } catch (error) {
    return messageOf(error).split("\n").slice(0, 3).join(" | ")
  }
}

if (import.meta.main) {
  const said = outcome()
  if (said !== undefined) process.stderr.write(`version: ${said}\n`)
}
