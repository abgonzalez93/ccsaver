import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { isRecord } from "../src/state/state.ts"
import { jsonOf, REPO } from "./helpers.ts"

const SKILLS = [
  ["bulk-reader", "bulk-read"],
  ["code-writer", "code-write"],
] as const

test("one version: both manifests carry it and the changelog opens with it", () => {
  const versionOf = (file: string): unknown => {
    const raw: unknown = JSON.parse(readFileSync(join(REPO, file), "utf8"))
    return isRecord(raw) ? raw["version"] : undefined
  }
  const [mine, plugin] = ["package.json", join(".claude-plugin", "plugin.json")].map(versionOf)
  assert.match(String(mine), /^\d+\.\d+\.\d+$/)
  assert.equal(plugin, mine)
  const [, first] = /^## (\S+)/m.exec(readFileSync(join(REPO, "CHANGELOG.md"), "utf8")) ?? []
  assert.equal(first, mine)
})

const PLUGIN_ROOT = /^"\$\{CLAUDE_PLUGIN_ROOT\}"\/(\S+)$/
const RUNNABLE = ["bin/ccsaver", ".githooks/post-commit", ".githooks/post-applypatch"]

const commandsIn = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(commandsIn)
  if (!isRecord(value)) return []
  return Object.entries(value).flatMap(([key, held]) =>
    key === "command" && typeof held === "string" ? [held] : commandsIn(held),
  )
}

test("the plugin's own files name each other, and what they point at can run", () => {
  const plugin = jsonOf(join(REPO, ".claude-plugin", "plugin.json"))
  const market = jsonOf(join(REPO, ".claude-plugin", "marketplace.json"))
  const listed: unknown = Array.isArray(market["plugins"]) ? market["plugins"][0] : undefined
  assert.equal(isRecord(listed) ? listed["name"] : undefined, plugin["name"])
  const commands = commandsIn(jsonOf(join(REPO, "hooks", "hooks.json")))
  assert.equal(commands.length, 1)
  const hooked = commands.flatMap((command) => PLUGIN_ROOT.exec(command)?.[1] ?? [])
  assert.equal(hooked.length, commands.length)
  for (const file of [...RUNNABLE, ...hooked]) {
    const path = join(REPO, file)
    assert.ok(existsSync(path), path)
    assert.ok((statSync(path).mode & 0o100) !== 0, `${file} is not executable`)
  }
})

const USAGE_BLOCK = /const USAGE = `([\s\S]*?)`\n/
const NAMED = /(?:^|`)ccsaver ([a-z-]+)/gm

const answered = (): Set<string> => {
  const source = readFileSync(join(REPO, "src", "cli.ts"), "utf8")
  const usage = USAGE_BLOCK.exec(source)?.[1] ?? ""
  return new Set(usage.split("\n").flatMap((line) => /^ {2}([a-z-]+)/.exec(line)?.[1] ?? []))
}

const pages = (dir: string): string[] =>
  readdirSync(join(REPO, dir)).filter((name) => name.endsWith(".md"))

test("every command a prompt of ours tells Claude to run is one the CLI answers", () => {
  const known = answered()
  assert.ok(known.size > 10)
  const places = [
    ...pages("commands").map((name) => join("commands", name)),
    ...SKILLS.map(([skill]) => join("skills", skill, "SKILL.md")),
  ]
  const unknown = places.flatMap((place) =>
    [...readFileSync(join(REPO, place), "utf8").matchAll(NAMED)].flatMap(([, word = ""]) =>
      known.has(word) ? [] : [`${place} names ccsaver ${word}`],
    ),
  )
  assert.deepEqual(unknown, [])
})

test("every slash command carries the one-line description the plugin menu shows", () => {
  const without = pages("commands").flatMap((name) => {
    const [, front = ""] =
      /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(join(REPO, "commands", name), "utf8")) ?? []
    return /^description: \S.*$/m.test(front) ? [] : [name]
  })
  assert.deepEqual(without, [])
})

test("code-writer tells Claude what a warn: line asks for", () => {
  const text = readFileSync(join(REPO, "skills", "code-writer", "SKILL.md"), "utf8")
  assert.match(text, /`warn:` line/)
})

test("code-writer always names a target, so the code never comes back to be written twice", () => {
  const text = readFileSync(join(REPO, "skills", "code-writer", "SKILL.md"), "utf8")
  const commands = text.split("\n").filter((line) => line.startsWith("ccsaver "))
  assert.equal(commands.length, 1)
  assert.match(commands[0] ?? "", / --target /)
})

for (const [skill, mode] of SKILLS)
  test(`${skill} pre-approves its own subcommand, and every command it shows starts with it`, () => {
    const text = readFileSync(join(REPO, "skills", skill, "SKILL.md"), "utf8")
    const prefix = /^allowed-tools: Bash\((ccsaver [a-z-]+ )\*\)$/m.exec(text)?.[1] ?? ""
    assert.equal(prefix, `ccsaver ${mode} `)
    const commands = text.split("\n").filter((line) => line.startsWith("ccsaver "))
    assert.ok(commands.length > 0)
    for (const command of commands) {
      assert.ok(command.startsWith(prefix), command)
      assert.doesNotMatch(command, / --(question|spec) /)
    }
  })
