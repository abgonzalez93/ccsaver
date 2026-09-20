import assert from "node:assert/strict"
import { test } from "node:test"
import { bump, changelogOf, levelOf, sectionOf } from "../scripts/version.ts"

const CHANGELOG = "# Changelog\n\nIntro.\n\n## Unreleased\n\n- an old note\n\n## 0.1.0\n\nFirst.\n"

test("the type decides the jump, and below 1.0.0 a breaking change moves the second number", () => {
  assert.deepEqual(
    ["feat: a", "feat(cli): a", "fix: a", "docs: a", "wip", 'Revert "feat: a"'].map(levelOf),
    ["minor", "minor", "patch", "patch", "patch", "patch"],
  )
  assert.deepEqual(["feat!: a", "fix(cli)!: a", "fix: a\n\nBREAKING CHANGE: b"].map(levelOf), [
    "major",
    "major",
    "major",
  ])
  assert.equal(bump("0.1.9", "patch"), "0.1.10")
  assert.equal(bump("0.1.9", "minor"), "0.2.0")
  assert.equal(bump("0.1.9", "major"), "0.2.0")
  assert.equal(bump("1.4.2", "major"), "2.0.0")
})

test("an entry is the subject and the bullets of the body: prose and trailers stay out", () => {
  const message = "fix: a\n\n- why\n  wrapped\nSome prose.\n\nSigned-off-by: X <x@x>\n"
  assert.equal(
    sectionOf("0.1.1", "2026-01-02", message),
    "## 0.1.1 - 2026-01-02\n\nfix: a\n\n- why\n  wrapped",
  )
  assert.equal(sectionOf("0.1.1", "2026-01-02", "fix: a\n"), "## 0.1.1 - 2026-01-02\n\nfix: a")
})

test("the changelog is the parent's plus one section, and an Unreleased heading is absorbed", () => {
  const mine = CHANGELOG.replace("Intro.", "A new intro.")
  const next = changelogOf(mine, CHANGELOG, "## 0.2.0 - 2026-01-02\n\nfeat: a")
  assert.equal(
    next,
    "# Changelog\n\nA new intro.\n\n## 0.2.0 - 2026-01-02\n\nfeat: a\n\n- an old note\n\n## 0.1.0\n\nFirst.\n",
  )
  assert.equal(changelogOf(next, CHANGELOG, "## 0.2.0 - 2026-01-02\n\nfeat: a"), next)
})

test("no section is ever dropped, however long the changelog grows", () => {
  const old = Array.from(
    { length: 60 },
    (_, index) => `## 0.0.${60 - index}\n\n${"- a line\n".repeat(9)}`,
  )
  const next = changelogOf(
    "# Changelog\n\nIntro.\n",
    `# Changelog\n\n${old.join("\n")}`,
    "## 0.1.0\n\nfeat: a",
  )
  assert.ok(next.split("\n").length > 350)
  const kept = [...next.matchAll(/^## (\S+)$/gm)].map(([, version]) => version)
  assert.deepEqual(kept, [
    "0.1.0",
    ...Array.from({ length: 60 }, (_, index) => `0.0.${60 - index}`),
  ])
  assert.match(next, /\n- a line\n$/)
})
