import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { DEFAULT_LIMITS } from "../src/config.ts"
import { attempt, isRecord, messageOf, parsed } from "../src/state.ts"

type Level = "major" | "minor" | "patch"

interface Edit {
  path: string
  now: string
  next: string
}

export interface Changelog {
  text: string
  overflow: string[]
}

const MANIFESTS = ["package.json", ".claude-plugin/plugin.json"]
const CHANGELOG = "CHANGELOG.md"
const FILED = "docs/changelog"
const VERSION_LINE = /^(\s*"version":\s*")[^"]*(")/m
const REPAIR = "git rebase --exec 'node scripts/version.ts' HEAD~<commits>"
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

const fits = (text: string): boolean =>
  text.split("\n").length <= DEFAULT_LIMITS.maxLines &&
  Buffer.byteLength(text) <= DEFAULT_LIMITS.maxTokens * 4

const headingOf = (part: string): string => part.split("\n")[0] ?? ""

const headingsOf = (text: string): string[] =>
  text.split("\n").filter((line) => line.startsWith("## "))

export const changelogOf = (
  mine: string,
  parent: string,
  section: string,
  filed: string,
): Changelog => {
  const intro = mine.slice(0, sectionsStart(mine)).trimEnd()
  const released = parent
    .slice(sectionsStart(parent))
    .replace(/^## Unreleased\n+/, "")
    .trimEnd()
  const already = headingsOf(filed)
  const parts = [intro, section, ...released.split(/\n+(?=## )/)].filter(
    (part) => part !== "" && !already.includes(headingOf(part)),
  )
  const upTo = (count: number): string => `${parts.slice(0, count).join("\n\n")}\n`
  const kept = Math.max(
    parts.findLastIndex((_, index) => fits(upTo(index + 1))) + 1,
    intro === "" ? 1 : 2,
  )
  return { text: upTo(kept), overflow: parts.slice(kept) }
}

export const filedAt = (index: number): string => `${FILED}/${index}.md`

const joined = (parts: string[]): string => `${parts.filter((part) => part !== "").join("\n\n")}\n`

export const filing = (files: string[], overflow: string[]): Edit[] => {
  if (overflow.length === 0) return []
  const newest = files.length
  const now = files[newest - 1] ?? ""
  const together = joined([...overflow, now.trimEnd()])
  return newest > 0 && fits(together)
    ? [{ path: filedAt(newest), now, next: together }]
    : [{ path: filedAt(newest + 1), now: "", next: joined(overflow) }]
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
  const born = edits.filter(({ now }) => now === "").map(({ path }) => path)
  for (const { path, next } of edits) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, next)
  }
  if (born.length > 0) git("add", "--", ...born)
  try {
    git(...AMEND, ...paths)
  } catch (error) {
    if (born.length > 0) git("rm", "--quiet", "--cached", "--force", "--", ...born)
    for (const { path, now } of edits)
      if (now === "") rmSync(path, { force: true })
      else writeFileSync(path, now)
    throw error
  }
  return git("rev-parse", "--short", "HEAD").trim()
}

const filedNow = (index = 1): string[] => {
  const text = committed(filedAt(index))
  return text === undefined ? [] : [text, ...filedNow(index + 1)]
}

const changed = ({ now, next }: Edit): boolean => now !== next

const editsFor = (after: string, section: string): Edit[] => {
  const manifests = MANIFESTS.flatMap((path): Edit[] => {
    const now = committed(path)
    return now === undefined ? [] : [{ path, now, next: now.replace(VERSION_LINE, `$1${after}$2`) }]
  })
  const now = committed(CHANGELOG)
  if (now === undefined) return manifests.filter(changed)
  const files = filedNow()
  const parent = committed(CHANGELOG, "HEAD~1") ?? ""
  const { text, overflow } = changelogOf(now, parent, section, files.join("\n"))
  return [...manifests, { path: CHANGELOG, now, next: text }, ...filing(files, overflow)].filter(
    changed,
  )
}

const versioned = (): string | undefined => {
  const [parents = "", date = "", ...lines] = git("log", "-1", "--format=%P%n%as%n%B").split("\n")
  const message = lines.join("\n")
  if (parents === "") return undefined
  if (parents.includes(" ")) return "a merge commit gets no version: keep the history linear"
  const before = versionOf(committed("package.json", "HEAD~1") ?? "")
  if (before === undefined) return "the parent commit carries no version, nothing to bump"
  const after = bump(before, levelOf(message))
  const stale = editsFor(after, sectionOf(after, date, message))
  if (stale.length === 0) return undefined
  if (midway())
    return `${after} not written in the middle of a pick or a patch series; then: ${REPAIR}`
  const dirty = git("status", "--porcelain", "--", ...stale.map(({ path }) => path)).trim()
  if (dirty !== "")
    return `${after} not written, changed outside the commit: ${dirty.replaceAll("\n", ",")}`
  return `${after}, amended as ${amended(stale)}`
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
