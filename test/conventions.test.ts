import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { test } from "node:test"
import { DEFAULT_LIMITS } from "../src/config.ts"
import { isRecord, parsed } from "../src/state.ts"
import { REPO } from "./helpers.ts"

const SKIPPED = [".git", "node_modules"]
const UNREAD_WHOLE = ["pnpm-lock.yaml", "CHANGELOG.md"]
const COMMENTS = [
  "// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.",
  "// the folder is the switch: without it the append fails and nothing else changes",
]
const STRINGS = /"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g
const BANNED = [
  ["a type assertion", /\bas\s+(?!const\b)[A-Za-z{[(]/],
  ["the function keyword", /\bfunction\b/],
  ["a default export", /^export default\b/],
] as const

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !SKIPPED.includes(entry.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : []
    })

const named = (path: string): string => relative(REPO, path)

const linesOf = (path: string): [string, string][] =>
  readFileSync(path, "utf8")
    .split("\n")
    .map((line, index) => [`${named(path)}:${index + 1}`, line])

const SRC = filesUnder(join(REPO, "src"))
const SCRIPTS = filesUnder(join(REPO, "scripts"))
const CODE = [...SRC, ...SCRIPTS, ...filesUnder(join(REPO, "test"))]

const importsOf = (path: string): string[] =>
  linesOf(path).flatMap(([, line]) => /from "([^"]+)"$/.exec(line)?.[1] ?? [])

test("src imports node: built-ins and its own files, and the package declares no runtime dependency", () => {
  const foreign = SRC.flatMap(importsOf).filter((name) => !/^(node:|\.\/)/.test(name))
  assert.deepEqual(foreign, [])
  const borrowed = SCRIPTS.flatMap(importsOf).filter((name) => !/^(node:|\.\.\/src\/)/.test(name))
  assert.deepEqual(borrowed, [])
  const manifest = parsed(readFileSync(join(REPO, "package.json"), "utf8"))
  const declared = Object.keys(isRecord(manifest) ? manifest : {})
  assert.deepEqual(
    declared.filter((key) => /^(d|peerD|optionalD|bundledD|bundleD)ependencies$/.test(key)),
    [],
  )
})

test("the hook starts with the three files of the state folder and nothing else of ours", () => {
  const ours = importsOf(join(REPO, "src", "hook.ts")).filter((name) => name.startsWith("."))
  assert.deepEqual(ours, ["./config.ts", "./log.ts", "./state.ts"])
})

test("no cast, no function keyword, no default export, and only the comments CONTRIBUTING lists", () => {
  const found = CODE.flatMap(linesOf).flatMap(([where, line]) => {
    const bare = line.replace(STRINGS, '""')
    const comment = /\/\/|\/\*/.test(bare) && !COMMENTS.includes(line.trim())
    const banned = BANNED.filter(([, shape]) => shape.test(bare)).map(([what]) => what)
    return [...(comment ? ["a comment"] : []), ...banned].map((what) => `${where} has ${what}`)
  })
  assert.deepEqual(found, [])
})

test("every JSON.parse lands in unknown, and every throw in src is a Refusal", () => {
  const landed = /: unknown = JSON\.parse\(|attempt<unknown>\(\(\) => JSON\.parse\(/
  const loose = CODE.flatMap(linesOf).filter(
    ([, line]) => line.replace(STRINGS, '""').includes("JSON.parse(") && !landed.test(line),
  )
  assert.deepEqual(loose, [])
  const thrown = SRC.flatMap(linesOf).flatMap(([where, line]) => {
    const name = /\bthrow new ([A-Za-z]+)/.exec(line.replace(STRINGS, '""'))?.[1]
    return name === undefined || name === "Refusal" ? [] : [`${where} throws ${name}`]
  })
  assert.deepEqual(thrown, [])
})

test("every file is readable whole under the default gate, the two append-only ones aside", () => {
  const over = filesUnder(REPO).flatMap((path) => {
    if (UNREAD_WHOLE.includes(named(path))) return []
    const bytes = readFileSync(path)
    const lines = bytes.filter((byte) => byte === 10).length
    const fits = lines <= DEFAULT_LIMITS.maxLines && bytes.length <= DEFAULT_LIMITS.maxTokens * 4
    return fits ? [] : [`${named(path)}: ${lines} lines, ${bytes.length} bytes`]
  })
  assert.deepEqual(over, [])
})

test("every symbol CONTRIBUTING cites lives in the file it names", () => {
  const text = readFileSync(join(REPO, "CONTRIBUTING.md"), "utf8")
  const cited = [...text.matchAll(/`((?:src|test|scripts)\/[a-z.-]+\.ts)` · `([A-Za-z]+)`/g)]
  assert.ok(cited.length > 0)
  const gone = cited.flatMap(([, file = "", symbol = ""]) =>
    new RegExp(`\\b${symbol}\\b`).test(readFileSync(join(REPO, file), "utf8"))
      ? []
      : [`${file} has no ${symbol}`],
  )
  assert.deepEqual(gone, [])
})
