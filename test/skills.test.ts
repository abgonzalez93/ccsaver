import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { REPO } from "./helpers.ts"

const SKILLS = [
  ["bulk-reader", "bulk-read"],
  ["code-writer", "code-write"],
] as const

for (const [skill, mode] of SKILLS)
  test(`${skill} pre-approves its own subcommand, and every command it shows starts with it`, () => {
    const text = readFileSync(join(REPO, "skills", skill, "SKILL.md"), "utf8")
    const prefix = /^allowed-tools: Bash\((\S+\/bin\/ccsaver [a-z-]+ )\*\)$/m.exec(text)?.[1] ?? ""
    assert.ok(prefix.endsWith(`/bin/ccsaver ${mode} `), prefix)
    const commands = text.split("\n").filter((line) => /^\S+\/bin\/ccsaver /.test(line))
    assert.ok(commands.length > 0)
    for (const command of commands) {
      assert.ok(command.startsWith(prefix), command)
      assert.doesNotMatch(command, / --(question|spec) /)
    }
  })
