import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { REPO, tempDir } from "./helpers.ts"

const HOOKS = join(REPO, ".githooks")
const REPAIR = `node ${join(REPO, "scripts", "version.ts")}`
const MANIFESTS = ["package.json", ".claude-plugin/plugin.json"]
const VERSION_FILES = [...MANIFESTS, "CHANGELOG.md"]
const MANIFEST = '{\n  "name": "x",\n  "version": "0.1.0"\n}\n'
const CHANGELOG = "# Changelog\n\nIntro.\n\n## Unreleased\n\n- an old note\n\n## 0.1.0\n\nFirst.\n"
const ENV = {
  PATH: process.env["PATH"] ?? "",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@t",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@t",
}

const git = (repo: string, ...args: string[]): string => {
  const ran = spawnSync("git", args, { cwd: repo, env: ENV, encoding: "utf8" })
  return `${ran.stdout}${ran.stderr}`
}

const hook = (repo: string, on: boolean): string =>
  git(repo, "config", "core.hooksPath", on ? HOOKS : "/dev/null")

const fresh = (hooked = true): string => {
  const repo = tempDir("version")
  git(repo, "init", "-q", "-b", "main")
  mkdirSync(join(repo, ".claude-plugin"))
  for (const path of MANIFESTS) writeFileSync(join(repo, path), MANIFEST)
  writeFileSync(join(repo, "CHANGELOG.md"), CHANGELOG)
  git(repo, "add", ".")
  git(repo, "commit", "-qm", "chore: base")
  hook(repo, hooked)
  return repo
}

const commit = (repo: string, message: string): string => {
  writeFileSync(join(repo, `${message.replace(/\W+/g, "-")}.txt`), message)
  git(repo, "add", ".")
  return git(repo, "commit", "-qm", message)
}

const versionsAt = (repo: string, where = "HEAD"): string[] =>
  MANIFESTS.map(
    (path) => /"version": "(.*)"/.exec(git(repo, "show", `${where}:${path}`))?.[1] ?? "",
  )

const entriesAt = (repo: string, where = "HEAD"): string[] =>
  git(repo, "show", `${where}:CHANGELOG.md`)
    .split("\n## ")
    .slice(1)
    .map((section) =>
      section
        .split("\n")
        .filter((line) => line !== "")
        .slice(0, 2)
        .join(" | "),
    )

const assertVersioned = (repo: string, version: string, subject: string): void => {
  assert.deepEqual(versionsAt(repo), [version, version])
  assert.match(
    entriesAt(repo)[0] ?? "",
    new RegExp(`^${version} - \\d{4}-\\d{2}-\\d{2} \\| ${subject}$`),
  )
  assert.equal(git(repo, "status", "--porcelain"), "")
}

const assertLeftAlone = (repo: string, said: string, version: string): void => {
  assert.match(
    said,
    /not written in the middle of a pick or a patch series; then: git rebase --exec/,
  )
  assert.deepEqual(versionsAt(repo), [version, version])
  assert.equal(git(repo, "status", "--porcelain"), "")
}

const patchesOf = (repo: string, count: number): string[] => {
  const dir = tempDir("patches")
  git(repo, "format-patch", "-q", `-${count}`, "-o", dir)
  return readdirSync(dir)
    .sort()
    .map((name) => join(dir, name))
}

const filedIn = (repo: string): string[] => {
  const dir = join(repo, "docs", "changelog")
  return existsSync(dir)
    ? readdirSync(dir)
        .sort()
        .map((name) => readFileSync(join(dir, name), "utf8"))
    : []
}

const fat = (repo: string, name: string, bullets: number): string => {
  writeFileSync(join(repo, `${name}.txt`), name)
  git(repo, "add", ".")
  const body = Array.from({ length: bullets }, (_, index) => `- ${name} bullet ${index}`)
  return git(repo, "commit", "-qm", `fix: ${name}\n\n${body.join("\n")}`)
}

test("no section is ever lost: what leaves the changelog is filed under docs/changelog", () => {
  const repo = fresh()
  const rounds = Array.from({ length: 14 }, (_, index) => index + 1)
  for (const round of rounds) fat(repo, `round-${round}`, 30)
  const files = [git(repo, "show", "HEAD:CHANGELOG.md"), ...filedIn(repo)]
  assert.ok(filedIn(repo).length > 0)
  for (const text of files)
    assert.ok(
      text.split("\n").length <= 350 && Buffer.byteLength(text) <= 32_000,
      `${text.split("\n").length} lines`,
    )
  const found = files.flatMap((text) =>
    [...text.matchAll(/^## (\S+)/gm)].map(([, version]) => version),
  )
  assert.deepEqual(found.toSorted(), ["0.1.0", ...rounds.map((round) => `0.1.${round}`)].toSorted())
  assert.equal(git(repo, "status", "--porcelain"), "")
})

const tagsIn = (repo: string): string[] =>
  git(repo, "tag", "--list")
    .split("\n")
    .filter((line) => line !== "")
    .toSorted()

const commitAt = (repo: string, ref: string): string => git(repo, "rev-parse", `${ref}^{commit}`)

test("every commit is tagged, and an amend that moves the number leaves no orphan behind", () => {
  const repo = fresh()
  commit(repo, "fix: one")
  assert.deepEqual(tagsIn(repo), ["v0.1.1"])
  assert.equal(commitAt(repo, "v0.1.1"), commitAt(repo, "HEAD"))
  commit(repo, "fix: two")
  assert.deepEqual(tagsIn(repo), ["v0.1.1", "v0.1.2"])

  git(repo, "commit", "-q", "--amend", "--no-edit")
  assert.deepEqual(tagsIn(repo), ["v0.1.1", "v0.1.2"])
  assert.equal(commitAt(repo, "v0.1.2"), commitAt(repo, "HEAD"))

  git(repo, "commit", "-q", "--amend", "-m", "feat: two, reworded")
  assert.deepEqual(tagsIn(repo), ["v0.1.1", "v0.2.0"])
  assert.equal(commitAt(repo, "v0.2.0"), commitAt(repo, "HEAD"))
  assert.equal(git(repo, "tag", "--no-merged", "HEAD").trim(), "")
})

test("git commit: every commit carries its version in both manifests and its entry on top", () => {
  const repo = fresh()
  assert.match(commit(repo, "fix: one"), /version: 0\.1\.1, amended/)
  assertVersioned(repo, "0.1.1", "fix: one")
  assert.match(
    git(repo, "show", "HEAD:CHANGELOG.md"),
    /Intro\.\n\n## 0\.1\.1 .*\n\nfix: one\n\n- an old note\n\n## 0\.1\.0\n/,
  )
  commit(repo, "feat: two")
  assertVersioned(repo, "0.2.0", "feat: two")
  commit(repo, "feat!: three")
  assertVersioned(repo, "0.3.0", "feat!: three")
  commit(repo, "no type at all")
  assertVersioned(repo, "0.3.1", "no type at all")
  assert.deepEqual(versionsAt(repo, "HEAD~1"), ["0.3.0", "0.3.0"])
})

test("the amend takes the version files and nothing else that is staged", () => {
  const repo = fresh()
  commit(repo, "fix: one")
  writeFileSync(join(repo, "staged.txt"), "kept for the next commit")
  git(repo, "add", "staged.txt")
  writeFileSync(join(repo, "fix-one.txt"), "changed")
  git(repo, "commit", "-qm", "fix: two", "fix-one.txt")
  assert.deepEqual(versionsAt(repo), ["0.1.2", "0.1.2"])
  assert.equal(git(repo, "status", "--porcelain"), "A  staged.txt\n")
  assert.doesNotMatch(git(repo, "show", "--name-only", "--format=", "HEAD"), /staged/)
})

test("git commit --amend never jumps twice, and a reworded type moves the number again", () => {
  const repo = fresh()
  commit(repo, "fix: one")
  commit(repo, "fix: two")
  git(repo, "commit", "-q", "--amend", "--no-edit")
  assertVersioned(repo, "0.1.2", "fix: two")
  git(repo, "commit", "-q", "--amend", "-m", "feat: two, reworded")
  assertVersioned(repo, "0.2.0", "feat: two, reworded")
  assert.equal(entriesAt(repo).length, 3)
})

test("a version file changed outside the commit is never swept in: the hook says so and waits", () => {
  const repo = fresh()
  writeFileSync(join(repo, "package.json"), MANIFEST.replace('"x"', '"y"'))
  writeFileSync(join(repo, "one.txt"), "one")
  git(repo, "add", "one.txt")
  const said = git(repo, "commit", "-qm", "fix: one")
  assert.match(said, /version: 0\.1\.1 not written, changed outside the commit: M package\.json/)
  assert.deepEqual(versionsAt(repo), ["0.1.0", "0.1.0"])
  git(repo, "checkout", "--", "package.json")
  git(repo, "commit", "-q", "--amend", "--no-edit")
  assertVersioned(repo, "0.1.1", "fix: one")
})

test("git am: a lone bare patch gets its version, and patches made with the hook land untouched", () => {
  const bare = fresh(false)
  commit(bare, "fix: one")
  commit(bare, "feat: two")
  const [first = ""] = patchesOf(bare, 2)
  const lone = fresh()
  git(lone, "am", "-q", first)
  assertVersioned(lone, "0.1.1", "fix: one")

  const made = fresh()
  commit(made, "fix: one")
  commit(made, "feat: two")
  const landed = fresh()
  git(landed, "am", "-q", ...patchesOf(made, 2))
  assertVersioned(landed, "0.2.0", "feat: two")
  assert.equal(git(landed, "rev-parse", "HEAD^{tree}"), git(made, "rev-parse", "HEAD^{tree}"))
  assert.equal(git(landed, "reflog").trim().split("\n").length, 3)
})

test("git am of a bare series: the hook stays out, and rebase --exec versions it afterwards", () => {
  const bare = fresh(false)
  commit(bare, "fix: one")
  commit(bare, "feat: two")
  const repo = fresh()
  assertLeftAlone(repo, git(repo, "am", "-q", ...patchesOf(bare, 2)), "0.1.0")
  git(repo, "rebase", "--exec", REPAIR, "HEAD~2")
  assertVersioned(repo, "0.2.0", "feat: two")
  assert.deepEqual(versionsAt(repo, "HEAD~1"), ["0.1.1", "0.1.1"])
})

test("cherry-pick and rebase: the hook stays out mid-pick, and the script versions them afterwards", () => {
  const repo = fresh(false)
  git(repo, "switch", "-qc", "lone")
  commit(repo, "fix: picked")
  git(repo, "switch", "-qc", "side", "main")
  commit(repo, "fix: on the side")
  commit(repo, "feat: also on the side")
  hook(repo, true)
  git(repo, "switch", "-q", "main")
  commit(repo, "feat: on main")

  assertLeftAlone(repo, git(repo, "cherry-pick", "lone"), "0.2.0")
  spawnSync("node", [join(REPO, "scripts", "version.ts")], { cwd: repo, env: ENV })
  assertVersioned(repo, "0.2.1", "fix: picked")

  git(repo, "switch", "-q", "side")
  assertLeftAlone(repo, git(repo, "rebase", "main"), "0.2.1")
  git(repo, "rebase", "--exec", REPAIR, "main")
  assertVersioned(repo, "0.3.0", "feat: also on the side")
  assert.deepEqual(versionsAt(repo, "HEAD~1"), ["0.2.2", "0.2.2"])
})

test("history stays linear: a fast-forward needs nothing, a merge commit gets no version", () => {
  const repo = fresh()
  git(repo, "switch", "-qc", "ahead")
  commit(repo, "feat: ahead")
  git(repo, "switch", "-q", "main")
  git(repo, "merge", "-q", "--ff-only", "ahead")
  assertVersioned(repo, "0.2.0", "feat: ahead")

  git(repo, "switch", "-qc", "topic", "HEAD~1")
  commit(repo, "fix: topic")
  git(repo, "switch", "-q", "main")
  git(repo, "merge", "--no-edit", "topic")
  const conflicted = git(repo, "diff", "--name-only", "--diff-filter=U").trim().split("\n")
  assert.deepEqual(conflicted.sort(), [...VERSION_FILES].sort())
  git(repo, "checkout", "--ours", "--", ...VERSION_FILES)
  git(repo, "add", ...VERSION_FILES)
  assert.match(git(repo, "commit", "--no-edit"), /version: a merge commit gets no version/)
  assert.deepEqual(versionsAt(repo), ["0.2.0", "0.2.0"])
})

test("a commit that carries a version conflicts on the version files when its base has moved", () => {
  const repo = fresh()
  git(repo, "switch", "-qc", "work")
  commit(repo, "fix: work")
  git(repo, "switch", "-q", "main")
  commit(repo, "feat: main moved")
  git(repo, "switch", "-q", "work")
  git(repo, "rebase", "main")
  const conflicted = git(repo, "diff", "--name-only", "--diff-filter=U").trim().split("\n")
  assert.ok(conflicted.every((path) => VERSION_FILES.includes(path)) && conflicted.length > 0)
})
