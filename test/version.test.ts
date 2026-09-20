import assert from "node:assert/strict"
import { test } from "node:test"
import { bump, changelogOf, filedAt, filing, levelOf, sectionOf } from "../scripts/version.ts"

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
  const { text, overflow } = changelogOf(mine, CHANGELOG, "## 0.2.0 - 2026-01-02\n\nfeat: a", "")
  assert.equal(
    text,
    "# Changelog\n\nA new intro.\n\n## 0.2.0 - 2026-01-02\n\nfeat: a\n\n- an old note\n\n## 0.1.0\n\nFirst.\n",
  )
  assert.deepEqual(overflow, [])
  assert.equal(changelogOf(text, CHANGELOG, "## 0.2.0 - 2026-01-02\n\nfeat: a", "").text, text)
})

test("a version the archive already holds is not carried twice", () => {
  const { text, overflow } = changelogOf(
    CHANGELOG,
    CHANGELOG,
    "## 0.2.0 - 2026-01-02\n\nfeat: a",
    "## 0.1.0\n\nFirst, in full.\n",
  )
  assert.doesNotMatch(text, /## 0\.1\.0/)
  assert.deepEqual(overflow, [])
})

test("what no longer fits in the changelog is handed over, never dropped", () => {
  const old = Array.from(
    { length: 60 },
    (_, index) => `## 0.0.${60 - index}\n\n${"- a line\n".repeat(9)}`,
  )
  const { text, overflow } = changelogOf(
    "# Changelog\n\nIntro.\n",
    `# Changelog\n\n${old.join("\n")}`,
    "## 0.1.0\n\nfeat: a",
    "",
  )
  assert.ok(text.split("\n").length <= 350 && text.length <= 32_000)
  assert.match(text, /^# Changelog\n\nIntro\.\n\n## 0\.1\.0\n\nfeat: a\n\n## 0\.0\.60\n/)
  assert.doesNotMatch(text, /^## 0\.0\.1$/m)
  const kept = [...text.matchAll(/^## (\S+)$/gm)].map(([, version]) => version)
  const handed = overflow.map((part) => part.split("\n")[0]?.slice(3))
  assert.deepEqual(
    [...kept, ...handed],
    ["0.1.0", ...Array.from({ length: 60 }, (_, index) => `0.0.${60 - index}`)],
  )
})

test("the archive takes the overflow, and starts a new file when the newest one is full", () => {
  const section = (version: string): string =>
    `## ${version}\n\n${"- a line\n".repeat(9)}`.trimEnd()
  assert.deepEqual(filing([], [section("0.0.1")]), [
    { path: filedAt(1), now: "", next: `${section("0.0.1")}\n` },
  ])
  const full = Array.from({ length: 28 }, (_, index) => section(`0.0.${index + 1}`)).join("\n\n")
  const [onto] = filing([`${full}\n`], [section("0.0.99")])
  assert.equal(onto?.path, filedAt(1))
  assert.equal(onto?.next, `${section("0.0.99")}\n\n${full}\n`)
  const brimming = Array.from({ length: 29 }, (_, index) => section(`0.0.${index + 1}`)).join(
    "\n\n",
  )
  assert.deepEqual(filing([`${brimming}\n`], [section("0.0.99")]), [
    { path: filedAt(2), now: "", next: `${section("0.0.99")}\n` },
  ])
  assert.deepEqual(filing(["a\n"], []), [])
})
