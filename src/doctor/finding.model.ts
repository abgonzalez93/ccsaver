import { readSync } from "node:fs"
import { marked, scrubbed } from "../cli/terminal.reporter.ts"
import { attempt, messageOf } from "../state/state.store.ts"

export type Level = "ok" | "warn" | "FAIL"

export interface Fix {
  shown: string
  apply: () => string
}

export interface Finding {
  level: Level
  text: string
  fix?: Fix
}

export const TONE = { ok: "ok", warn: "warn", FAIL: "fail" } as const
const YES = /^\s*(y|yes|s|si|sí)\s*$/i
const ANSWER_BYTES = 64
const ANSWER_CAP = 4096

export const painted = (level: Level, text: string): string =>
  marked(TONE[level], level.padEnd(4), text)

const lineFrom = (fd: number): string | undefined => {
  const buffer = Buffer.alloc(ANSWER_BYTES)
  let typed = ""
  while (!typed.includes("\n") && typed.length < ANSWER_CAP) {
    const read = attempt(() => readSync(fd, buffer, 0, ANSWER_BYTES, null))
    if (read === undefined) return undefined
    if (read === 0) break
    typed += buffer.subarray(0, read).toString("utf8")
  }
  return typed.split("\n")[0] ?? ""
}

const answered = (question: string): boolean => {
  process.stdout.write(question)
  const typed = lineFrom(0)
  process.stdout.write(typed === undefined ? "\n" : "")
  return typed !== undefined && YES.test(typed)
}

export const offer = (fixes: Fix[]): void => {
  if (fixes.length === 0 || process.stdin.isTTY !== true) return
  for (const fix of fixes) {
    process.stdout.write(scrubbed(`\nfix: ${fix.shown}\n`))
    if (!answered("run it? [y/N] ")) {
      process.stdout.write("skipped\n")
      continue
    }
    try {
      process.stdout.write(scrubbed(`${fix.apply()}\n`))
    } catch (error) {
      process.stdout.write(`${painted("FAIL", scrubbed(messageOf(error)))}\n`)
    }
  }
}
