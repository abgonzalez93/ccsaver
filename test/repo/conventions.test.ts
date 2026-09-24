import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { test } from "node:test"
import { DEFAULT_LIMITS } from "../../src/state/config.store.ts"
import { isRecord, parsed } from "../../src/state/state.store.ts"
import { REPO } from "../test.helpers.ts"

const SKIPPED = [".git", "node_modules"]
const UNREAD_WHOLE = ["pnpm-lock.yaml", "CHANGELOG.md"]
const CROWDED = 6
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
  const foreign = SRC.flatMap(importsOf).filter((name) => !/^(node:|\.\.?\/)/.test(name))
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

test("the hook starts with the three files of the state folder, the boundary guard, and nothing else of ours", () => {
  const ours = importsOf(join(REPO, "src", "read-gate.hook.ts")).filter((name) =>
    name.startsWith("."),
  )
  assert.deepEqual(ours, [
    "./boundary/boundary.guard.ts",
    "./state/config.store.ts",
    "./state/log.store.ts",
    "./state/state.store.ts",
  ])
})

test("the handoff hook starts with those three, its own store, and nothing else of ours", () => {
  const ours = importsOf(join(REPO, "src", "handoff.hook.ts")).filter((name) =>
    name.startsWith("."),
  )
  assert.deepEqual(ours, [
    "./state/config.store.ts",
    "./state/handoff.store.ts",
    "./state/log.store.ts",
    "./state/state.store.ts",
  ])
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

test("no directory but the root reaches six files", () => {
  const grouped = Object.groupBy(filesUnder(REPO), (path) => named(dirname(path)))
  const crowded = Object.entries(grouped)
    .filter(([dir, files]) => dir !== "" && (files?.length ?? 0) >= CROWDED)
    .map(([dir, files]) => `${dir}: ${files?.length} files`)
  assert.deepEqual(crowded, [])
})

const KEBAB = /^\.?[a-z0-9]+(?:[-.][a-z0-9]+)*$/
const NAMED_BY_A_TOOL = ["SKILL.md"]
const ROLES = [
  "cli",
  "hook",
  "store",
  "service",
  "client",
  "guard",
  "validator",
  "model",
  "reporter",
  "helpers",
  "test",
]

const roleOf = (file: string): string | undefined => {
  const parts = file.split(".")
  return parts.length >= 3 ? parts.at(-2) : undefined
}

test("below the root every name is kebab-case, and every TypeScript file is name.role.ts", () => {
  const odd = filesUnder(REPO).flatMap((path) => {
    const parts = named(path).split("/")
    const file = parts.at(-1) ?? ""
    const shouted =
      parts.length === 1
        ? []
        : parts.filter((part) => !NAMED_BY_A_TOOL.includes(part) && !KEBAB.test(part))
    const roleless = file.endsWith(".ts") && !ROLES.includes(roleOf(file) ?? "")
    return [
      ...shouted.map((part) => `${named(path)}: ${part} is not kebab-case`),
      ...(roleless ? [`${named(path)}: not name.role.ts`] : []),
    ]
  })
  assert.deepEqual(odd, [])
})

const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g
const HEADING = /^#{1,6} .+$/gm
const ELSEWHERE = /^(https?|mailto):/

const slugOf = (heading: string): string =>
  heading
    .replace(/^#+ /, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")

const anchorsOf = (path: string): Set<string> =>
  new Set((readFileSync(path, "utf8").match(HEADING) ?? []).map(slugOf))

const brokenLink = (
  page: string,
  anchors: Map<string, Set<string>>,
  label: string,
  target: string,
): string[] => {
  if (ELSEWHERE.test(target)) return []
  const [path = "", anchor] = target.split("#")
  const full = path === "" ? page : join(dirname(page), path)
  const where = `${named(page)}: [${label}](${target})`
  if (!existsSync(full)) return [`${where} names no file`]
  if (anchor === undefined || !full.endsWith(".md")) return []
  return anchors.get(full)?.has(anchor) === true ? [] : [`${where} names no heading`]
}

test("every link between the documents resolves, the file and the heading", () => {
  const pages = filesUnder(REPO).filter((path) => path.endsWith(".md"))
  const anchors = new Map(pages.map((page) => [page, anchorsOf(page)]))
  const broken = pages.flatMap((page) =>
    [...readFileSync(page, "utf8").matchAll(LINK)].flatMap(([, label = "", target = ""]) =>
      brokenLink(page, anchors, label, target),
    ),
  )
  assert.deepEqual(broken, [])
})

test("every symbol CONTRIBUTING cites lives in the file it names", () => {
  const text = readFileSync(join(REPO, "CONTRIBUTING.md"), "utf8")
  const cited = [...text.matchAll(/`((?:src|test|scripts)\/[a-z./-]+\.ts)` · `([A-Za-z]+)`/g)]
  assert.ok(cited.length > 0)
  const gone = cited.flatMap(([, file = "", symbol = ""]) =>
    new RegExp(`\\b${symbol}\\b`).test(readFileSync(join(REPO, file), "utf8"))
      ? []
      : [`${file} has no ${symbol}`],
  )
  assert.deepEqual(gone, [])
})
