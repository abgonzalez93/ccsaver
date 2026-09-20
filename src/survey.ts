import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { BYTES_PER_TOKEN, DEFAULT_LIMITS, type Limits } from "./config.ts"
import { attempt } from "./state.ts"

const PRUNED = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  "coverage",
  ".next",
  ".turbo",
  "out",
]
const READ_CAP = 4000
const NUL = 0
const LINE_BREAK = 10
const SHARE = 0.95
const IN_TWENTY = 20
const ROUNDING = 50

export interface Survey {
  walked: number
  counted: number
  typical: number
  suggested: number
}

const filesUnder = (dir: string, found: string[]): string[] => {
  for (const entry of attempt(() => readdirSync(dir, { withFileTypes: true })) ?? []) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!PRUNED.includes(entry.name)) filesUnder(path, found)
    } else if (entry.isFile()) found.push(path)
  }
  return found
}

const linesIn = (bytes: Buffer): number => {
  let lines = bytes.length > 0 && bytes.at(-1) !== LINE_BREAK ? 1 : 0
  for (let at = bytes.indexOf(LINE_BREAK); at !== -1; at = bytes.indexOf(LINE_BREAK, at + 1))
    lines += 1
  return lines
}

const linesOf = (path: string, maxBytes: number): number | undefined => {
  const size = attempt(() => statSync(path).size)
  if (size === undefined || size > maxBytes) return undefined
  const bytes = attempt(() => readFileSync(path))
  return bytes === undefined || bytes.includes(NUL) ? undefined : linesIn(bytes)
}

const strided = (files: string[]): string[] => {
  const step = Math.ceil(files.length / READ_CAP)
  return step > 1 ? files.filter((_, at) => at % step === 0) : files
}

const percentile = (sorted: number[], share: number): number =>
  sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)] ?? 0

export const surveyFor = (root: string, limits: Limits): Survey => {
  const walked = filesUnder(root, [])
  const counted = strided(walked)
    .flatMap((path) => linesOf(path, limits.maxTokens * BYTES_PER_TOKEN) ?? [])
    .sort((first, second) => first - second)
  const typical = percentile(counted, SHARE)
  return {
    walked: walked.length,
    counted: counted.length,
    typical,
    suggested: Math.max(DEFAULT_LIMITS.maxLines, Math.ceil(typical / ROUNDING) * ROUNDING),
  }
}

export const overshoots = ({ counted, typical }: Survey, inForce: number): boolean =>
  counted >= IN_TWENTY && typical > inForce

export const proposalOf = (survey: Survey, inForce: number): string => {
  const { walked, counted, typical, suggested } = survey
  if (counted < IN_TWENTY)
    return `measured: ${counted} countable of ${walked} files, too few to judge the ${inForce}-line limit`
  const measured = `measured: ${counted} of ${walked} files, ${IN_TWENTY - 1} in ${IN_TWENTY} under ${typical} lines`
  return overshoots(survey, inForce)
    ? `${measured}: the ${inForce}-line limit denies normal files here, and an adapter with {"maxLines": ${suggested}} would not (docs/configuration.md#limits)`
    : `${measured}, which the ${inForce}-line limit already fits`
}
