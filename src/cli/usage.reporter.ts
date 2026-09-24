import { record } from "../state/log.store.ts"
import { marked, scrubbed } from "./terminal.reporter.ts"

export const USAGE = `usage: ccsaver <command>

  setup                      ask for worker, key and fallback, write the launcher, run doctor
  plug [dir] [adapter]       turn ccsaver on for one project (default: this folder)
  adapter <name> k=v ...     set maxLines or maxTokens on an adapter, creating it
  unplug <dir>               turn it off again
  list                       show the plugged projects
  worker set <url> <model>   point at an OpenAI-compatible chat completions endpoint
  worker claude <path>|auto  pin the claude binary the fallback runs (auto: the session's own)
  key set                    store the API key, read from the terminal or from stdin
  launcher write             put a launcher in ~/.local/bin, so a terminal of yours finds ccsaver
  fallback on|off            whether a call the worker cannot take goes to paid Claude Haiku
  log on|off                 record events (metadata only) in a local file; off by default
  handoff on|off|<tokens>    warn at the end of a turn past this much context; alone, what is set
  handoff write              keep a handoff read from stdin, what /ccsaver:handoff runs
  saved [month|all]          what the log says it cost, and what it would have cost without
  price <model>|worker <usd> dollars per million input tokens; price alone lists them
  doctor                     check permissions, key, worker, fallback, launcher and projects
  version                    print the version

  bulk-read  --question=<q> --paths <file>... [--project <dir>]
  code-write --spec=<s> --reference <file>... [--target <out>] [--project <dir>]
`

export type Outcome = number | string

export type Command = (rest: string[]) => Outcome

export const tooMany = (name: string, most: number, rest: string[]): string | undefined => {
  if (rest.length <= most) return undefined
  const takes = most === 0 ? "no arguments" : `at most ${most} argument${most === 1 ? "" : "s"}`
  return `${name} takes ${takes}, not ${rest.length}: ${rest.join(" ")}`
}

export const atMost =
  (name: string, most: number, run: Command): Command =>
  (rest: string[]): Outcome =>
    tooMany(name, most, rest) ?? run(rest)

export const onOff = (name: string, first: string | undefined): string =>
  first === undefined ? `${name} needs on or off` : `${name} takes on or off, not: ${first}`

export const only = (name: string, verb: string, first: string | undefined): string =>
  first === undefined
    ? `${name} needs ${verb}: ccsaver ${name} ${verb}`
    : `${name} takes ${verb}, not: ${first}`

const usageFor = (command: string): string[] =>
  USAGE.split("\n").filter(
    (line) => line.startsWith(`  ${command} `) || line.trimEnd() === `  ${command}`,
  )

export const mistake = (command: string, complaint: string): number => {
  const lines = usageFor(command.replace(/^-+/, ""))
  const usage =
    lines.length === 0
      ? USAGE
      : `${lines.map((line, at) => `${at === 0 ? "usage:" : "      "} ccsaver ${line.trimStart()}`).join("\n")}\n`
  process.stderr.write(`${marked("fail", "Error:", scrubbed(complaint), process.stderr)}\n${usage}`)
  record("fail", { text: complaint })
  return 1
}
