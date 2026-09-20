import assert from "node:assert/strict"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { after, test } from "node:test"
import { DEFAULT_LIMITS } from "../src/config.ts"
import { overshoots, proposalOf, surveyFor } from "../src/survey.ts"
import { LAUNCHER, run, tempDir } from "./helpers.ts"

const WORK = tempDir("survey-work")
const LIMIT = DEFAULT_LIMITS.maxLines

const sourceOf = (lines: number): string => "const a = 1\n".repeat(lines)

const projectOf = (name: string, files: Record<string, string>): string => {
  const root = join(WORK, name)
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }
  return root
}

const spread = (count: number, lines: (at: number) => number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, at) => [`src/mod${at}.ts`, sourceOf(lines(at))]),
  )

const sourcesOf = (name: string, count: number, lines: (at: number) => number): string =>
  projectOf(name, spread(count, lines))

after(() => {
  rmSync(WORK, { recursive: true, force: true })
})

test("a project whose files fit the limit in force is told so and proposes nothing", () => {
  const root = sourcesOf("small", 40, (at) => 20 + at)
  const survey = surveyFor(root, DEFAULT_LIMITS)
  assert.equal(survey.counted, 40)
  assert.equal(overshoots(survey, LIMIT), false)
  assert.match(proposalOf(survey, LIMIT), /which the 350-line limit already fits$/)
})

test("a project of long files proposes a limit above them, rounded up to fifty", () => {
  const root = sourcesOf("long", 40, (at) => 400 + at * 20)
  const survey = surveyFor(root, DEFAULT_LIMITS)
  assert.equal(overshoots(survey, LIMIT), true)
  assert.ok(survey.suggested > survey.typical)
  assert.equal(survey.suggested % 50, 0)
  assert.match(proposalOf(survey, LIMIT), /"maxLines": \d+/)
})

test("the proposal never falls below the default, however short the files are", () => {
  const root = sourcesOf("tiny", 40, () => 3)
  assert.equal(surveyFor(root, DEFAULT_LIMITS).suggested, LIMIT)
})

test("under twenty countable files it refuses to judge the limit", () => {
  const root = sourcesOf("few", 19, () => 900)
  const survey = surveyFor(root, DEFAULT_LIMITS)
  assert.equal(overshoots(survey, LIMIT), false)
  assert.match(proposalOf(survey, LIMIT), /too few to judge the 350-line limit$/)
})

test("pruned folders, binary files and files past the byte limit are left out of the count", () => {
  const root = projectOf("mixed", {
    ...spread(20, () => 10),
    "node_modules/big/index.js": sourceOf(9000),
    ".git/objects/pack": sourceOf(9000),
    "dist/bundle.js": sourceOf(9000),
    "huge.txt": "x".repeat(DEFAULT_LIMITS.maxTokens * 4 + 1),
  })
  writeFileSync(join(root, "logo.png"), Buffer.from([137, 80, 78, 71, 0, 13, 10]))
  const survey = surveyFor(root, DEFAULT_LIMITS)
  assert.equal(survey.counted, 20)
  assert.ok(survey.walked > survey.counted)
  assert.equal(overshoots(survey, LIMIT), false)
})

test("doctor warns about a project that outgrew its limit and never fails for it", async () => {
  const home = tempDir("survey-home")
  const root = sourcesOf("outgrown", 40, (at) => 500 + at * 10)
  assert.equal((await run(LAUNCHER, ["plug", root], { CCSAVER_HOME: home })).code, 0)
  const out = await run(LAUNCHER, ["doctor"], { CCSAVER_HOME: home })
  assert.match(out.stdout, new RegExp(`^warn shape: ${root} · measured: 40 of \\d+ files`, "m"))
  assert.match(out.stdout, /"maxLines": \d+/)
  assert.equal(out.stdout.includes(`FAIL shape: ${root}`), false)
  rmSync(home, { recursive: true, force: true })
})
