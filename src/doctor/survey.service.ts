import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join } from "node:path"
import { quoted } from "../cli/terminal.reporter.ts"
import {
  DEFAULT_LIMITS,
  HEAD_BYTES,
  headOf,
  isBinary,
  type Limits,
  linesIn,
  SCAN_CEILING,
  tokensIn,
} from "../measure/measure.helpers.ts"
import { attempt } from "../state/state.store.ts"

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
  ".cache",
  ".gradle",
  "Pods",
]
const READ_CAP = 4000
const SHARE = 0.95
const IN_TWENTY = 20
const LINE_STEP = 50
const TOKEN_STEP = 1000

interface Survey {
  walked: number
  counted: number
  typical: Limits
  suggested: Limits
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

const measure = (path: string): Limits | undefined => {
  const size = attempt(() => statSync(path).size)
  if (size === undefined || size > SCAN_CEILING) return undefined
  const head = headOf(path)
  if (head === undefined || isBinary(head)) return undefined
  const bytes = size <= HEAD_BYTES ? head : attempt(() => readFileSync(path))
  return bytes === undefined
    ? undefined
    : { maxLines: linesIn(bytes), maxTokens: tokensIn(bytes.length) }
}

const strided = (files: string[]): string[] => {
  const step = Math.ceil(files.length / READ_CAP)
  return step > 1 ? files.filter((_, at) => at % step === 0) : files
}

const percentile = (values: number[]): number => {
  const sorted = [...values].sort((first, second) => first - second)
  return sorted[Math.max(0, Math.ceil(SHARE * sorted.length) - 1)] ?? 0
}

const raisedTo = (value: number, step: number, floor: number): number =>
  Math.max(floor, Math.ceil(value / step) * step)

export const surveyFor = (root: string): Survey => {
  const walked = filesUnder(root, [])
  const measured = strided(walked).flatMap((path) => measure(path) ?? [])
  const typical = {
    maxLines: percentile(measured.map(({ maxLines }) => maxLines)),
    maxTokens: percentile(measured.map(({ maxTokens }) => maxTokens)),
  }
  return {
    walked: walked.length,
    counted: measured.length,
    typical,
    suggested: {
      maxLines: raisedTo(typical.maxLines, LINE_STEP, DEFAULT_LIMITS.maxLines),
      maxTokens: raisedTo(typical.maxTokens, TOKEN_STEP, DEFAULT_LIMITS.maxTokens),
    },
  }
}

export const raiseOf = ({ typical, suggested }: Survey, inForce: Limits): Partial<Limits> => ({
  ...(typical.maxLines > inForce.maxLines ? { maxLines: suggested.maxLines } : {}),
  ...(typical.maxTokens > inForce.maxTokens ? { maxTokens: suggested.maxTokens } : {}),
})

export const overshoots = (survey: Survey, inForce: Limits): boolean =>
  survey.counted >= IN_TWENTY && Object.keys(raiseOf(survey, inForce)).length > 0

const sampledIn = (walked: number): string =>
  walked > READ_CAP ? ` (1 in ${Math.ceil(walked / READ_CAP)} sampled)` : ""

export const adapterNameOf = (root: string): string =>
  basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project"

export const fixOf = (survey: Survey, inForce: Limits, root: string, adapter?: string): string => {
  const name = adapter ?? adapterNameOf(root)
  const pairs = Object.entries(raiseOf(survey, inForce))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
  const set = `ccsaver adapter ${name} ${pairs}`
  return adapter === undefined ? `${set} && ccsaver plug ${quoted(root)} ${name}` : set
}

export const proposalOf = (
  survey: Survey,
  inForce: Limits,
  root: string,
  adapter?: string,
): string => {
  const { walked, counted, typical } = survey
  if (counted < IN_TWENTY)
    return `measured: ${counted} countable of ${walked} files, too few to judge the limits in force`
  const measured = `measured: ${counted} of ${walked} files${sampledIn(walked)}, ${IN_TWENTY - 1} in ${IN_TWENTY} under ${typical.maxLines} lines and ${typical.maxTokens} tokens`
  return overshoots(survey, inForce)
    ? `${measured}: the limits in force deny normal files here. To fit them, run: ${fixOf(survey, inForce, root, adapter)}`
    : `${measured}, which the ${inForce.maxLines}-line, ${inForce.maxTokens}-token limits already fit`
}
