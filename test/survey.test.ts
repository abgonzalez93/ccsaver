import assert from "node:assert/strict"
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { after, test } from "node:test"
import { DEFAULT_LIMITS } from "../src/config.ts"
import { overshoots, proposalOf, surveyFor } from "../src/survey.ts"
import { LAUNCHER, run, tempDir } from "./helpers.ts"

const WORK = tempDir("survey-work")
const WIDE = 40

const sourceOf = (lines: number, width = 12): string => `${"x".repeat(width - 1)}\n`.repeat(lines)

const projectOf = (name: string, files: Record<string, string>): string => {
  const root = join(WORK, name)
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }
  return root
}

const spread = (count: number, lines: (at: number) => number, width = 12): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, at) => [`src/mod${at}.ts`, sourceOf(lines(at), width)]),
  )

const sourcesOf = (name: string, count: number, lines: (at: number) => number): string =>
  projectOf(name, spread(count, lines))

after(() => {
  rmSync(WORK, { recursive: true, force: true })
})

test("a project whose files fit the limits in force is told so and proposes nothing", () => {
  const root = sourcesOf("small", 40, (at) => 20 + at)
  const survey = surveyFor(root)
  assert.equal(survey.counted, 40)
  assert.equal(overshoots(survey, DEFAULT_LIMITS), false)
  assert.match(proposalOf(survey, DEFAULT_LIMITS, root), /limits already fit$/)
})

test("a project of long files proposes a line limit above them, rounded up to fifty", () => {
  const root = sourcesOf("long", 40, (at) => 400 + at * 20)
  const survey = surveyFor(root)
  assert.equal(overshoots(survey, DEFAULT_LIMITS), true)
  assert.ok(survey.suggested.maxLines > survey.typical.maxLines)
  assert.equal(survey.suggested.maxLines % 50, 0)
  assert.match(proposalOf(survey, DEFAULT_LIMITS, root, "an-adapter"), /maxLines=\d+/)
})

test("the proposal is a command that can be run, and names the plug when there is no adapter", () => {
  const root = sourcesOf("fixable", 40, (at) => 400 + at * 20)
  const survey = surveyFor(root)
  const withAdapter = proposalOf(survey, DEFAULT_LIMITS, root, "mine")
  assert.match(withAdapter, /To fit them, run: ccsaver adapter mine maxLines=\d+$/)
  const without = proposalOf(survey, DEFAULT_LIMITS, root)
  assert.match(
    without,
    new RegExp(`ccsaver adapter fixable maxLines=\\d+ && ccsaver plug ${root} fixable$`),
  )
})

test("a source file past the byte limit still counts, lines and tokens alike", () => {
  const root = projectOf(
    "heavy",
    spread(40, () => 1000, WIDE),
  )
  const survey = surveyFor(root)
  assert.equal(survey.counted, 40)
  assert.equal(survey.typical.maxLines, 1000)
  assert.ok(survey.typical.maxTokens > DEFAULT_LIMITS.maxTokens)
  assert.match(proposalOf(survey, DEFAULT_LIMITS, root, "a"), /maxLines=\d+ maxTokens=\d+$/)
})

test("a project of few but very wide lines is told its token limit is the one too small", () => {
  const root = projectOf(
    "wide",
    spread(40, () => 100, 500),
  )
  const survey = surveyFor(root)
  assert.equal(overshoots(survey, DEFAULT_LIMITS), true)
  const proposal = proposalOf(survey, DEFAULT_LIMITS, root, "a")
  assert.match(proposal, /maxTokens=\d+$/)
  assert.equal(proposal.includes("maxLines"), false)
})

test("the proposal never falls below the defaults, however short the files are", () => {
  const { suggested } = surveyFor(sourcesOf("tiny", 40, () => 3))
  assert.deepEqual(suggested, { ...DEFAULT_LIMITS })
})

test("under twenty countable files it refuses to judge the limits", () => {
  const root = sourcesOf("few", 19, () => 900)
  const survey = surveyFor(root)
  assert.equal(overshoots(survey, DEFAULT_LIMITS), false)
  assert.match(proposalOf(survey, DEFAULT_LIMITS, root), /too few to judge the limits in force$/)
})

test("pruned folders and binary files are left out of the count", () => {
  const root = projectOf("mixed", {
    ...spread(20, () => 10),
    "node_modules/big/index.js": sourceOf(9000),
    ".git/objects/pack": sourceOf(9000),
    "dist/bundle.js": sourceOf(9000),
  })
  writeFileSync(join(root, "logo.png"), Buffer.from([137, 80, 78, 71, 0, 13, 10]))
  const survey = surveyFor(root)
  assert.equal(survey.counted, 20)
  assert.ok(survey.walked > survey.counted)
  assert.equal(overshoots(survey, DEFAULT_LIMITS), false)
})

test("a symlinked directory is never walked, so a loop cannot hang the measurement", () => {
  const root = sourcesOf("linked", 20, () => 10)
  const elsewhere = sourcesOf("linked-target", 30, () => 4000)
  symlinkSync(elsewhere, join(root, "src", "vendored"))
  symlinkSync(root, join(root, "src", "loop"))
  const survey = surveyFor(root)
  assert.equal(survey.counted, 20)
  assert.equal(overshoots(survey, DEFAULT_LIMITS), false)
})

test("doctor warns about a project that outgrew its limits and never fails for it", async () => {
  const home = tempDir("survey-home")
  const root = sourcesOf("outgrown", 40, (at) => 500 + at * 10)
  assert.equal((await run(LAUNCHER, ["plug", root], { CCSAVER_HOME: home })).code, 0)
  const out = await run(LAUNCHER, ["doctor"], { CCSAVER_HOME: home })
  assert.match(out.stdout, new RegExp(`^warn shape: ${root} · measured: 40 of \\d+ files`, "m"))
  assert.match(out.stdout, /To fit them, run: ccsaver adapter \S+ maxLines=\d+/)
  assert.equal(out.stdout.includes(`FAIL shape: ${root}`), false)
  rmSync(home, { recursive: true, force: true })
})
