import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { isRecord } from "../src/state.ts"
import { REPO } from "./helpers.ts"

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
