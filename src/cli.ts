import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Limits,
  limitsFor,
  plug,
  readPlugged,
  setClaude,
  setFallback,
  unplug,
  writeLimits,
  writeWorker,
} from "./config.ts"
import { doctor } from "./doctor.ts"
import { crashed, record, setLog } from "./log.ts"
import { attempt, isRecord, messageOf, parsed, Refusal } from "./state.ts"
import { proposalOf, surveyFor } from "./survey.ts"
import { shown } from "./transport.ts"
import { isMode, runWorker } from "./worker.ts"

const USAGE = `usage: ccsaver <command>

  setup                      ask for worker, key and fallback, then run doctor
  plug [dir] [adapter]       turn ccsaver on for one project (default: this folder)
  adapter <name> k=v ...     set maxLines or maxTokens on an adapter, creating it
  unplug <dir>               turn it off again
  list                       show the plugged projects
  worker set <url> <model>   point at an OpenAI-compatible chat completions endpoint
  worker claude <path>|auto  pin the claude binary the fallback runs (auto: the session's own)
  key set                    store the API key, read from the terminal or from stdin
  fallback on|off            whether a call the worker cannot take goes to paid Claude Haiku
  log on|off                 record events (metadata only) in a local file; off by default
  doctor                     check permissions, key, worker, fallback and projects
  version                    print the version

  bulk-read  --question=<q> --paths <file>... [--project <dir>]
  code-write --spec=<s> --reference <file>... [--target <out>] [--project <dir>]
`

const PACKAGE = join(import.meta.dirname, "..", "package.json")
const HELP = [undefined, "help", "--help", "-h"]
const LIMIT_KEYS = ["maxLines", "maxTokens"] as const

const limitsGiven = (pairs: string[]): Partial<Limits> => {
  const given = pairs.map((pair) => pair.split("="))
  const wrong = given.filter(
    ([key, value, extra]) =>
      !LIMIT_KEYS.some((known) => known === key) ||
      extra !== undefined ||
      !/^[1-9][0-9]*$/.test(value ?? ""),
  )
  if (wrong.length > 0 || given.length === 0)
    throw new Refusal(`usage: ccsaver adapter <name> ${LIMIT_KEYS.join("=<n> ")}=<n>`)
  return Object.fromEntries(given.map(([key, value]) => [key, Number(value)]))
}

const version = (): string => {
  const raw = parsed(attempt(() => readFileSync(PACKAGE, "utf8")) ?? "")
  return isRecord(raw) && typeof raw["version"] === "string" ? raw["version"] : "unknown"
}

type Outcome = number | undefined

type Command = (rest: string[]) => Outcome

const printVersion: Command = (): Outcome => {
  process.stdout.write(`${version()}\n`)
  return 0
}

const COMMANDS: Record<string, Command> = {
  plug: ([first, second]) => {
    const { root, adapter } = plug(first ?? process.cwd(), second)
    const limits = limitsFor(adapter)
    process.stdout.write(
      `plugged ${root} · adapter ${adapter ?? "none"}\n${proposalOf(surveyFor(root), limits, root, adapter)}\n`,
    )
    return 0
  },
  adapter: ([first, ...pairs]) => {
    if (first === undefined) return undefined
    const place = writeLimits(first, limitsGiven(pairs))
    process.stdout.write(`adapter ${first} written to ${place}\n`)
    return 0
  },
  unplug: ([first]) => {
    if (first === undefined) return undefined
    process.stdout.write(unplug(first) ? `unplugged ${first}\n` : `${first} was not plugged\n`)
    return 0
  },
  list: () => {
    const entries = readPlugged()
    process.stdout.write(
      entries.length === 0
        ? "nothing is plugged in\n"
        : entries.map(({ root, adapter }) => `${root}\t${adapter ?? ""}\n`).join(""),
    )
    return 0
  },
  worker: ([first, second, third]) => {
    if (first === "claude" && second !== undefined) {
      const pinned = setClaude(second === "auto" ? undefined : second)
      process.stdout.write(`fallback binary: ${pinned ?? "the session's own claude"}\n`)
      return 0
    }
    if (first !== "set" || second === undefined || third === undefined) return undefined
    const advice = writeWorker(second, third)
    process.stdout.write(`worker set to ${shown(second)} · ${third}\n`)
    if (advice !== undefined) process.stderr.write(`warn: ${advice}\n`)
    return 0
  },
  fallback: ([first]) => {
    if (first !== "on" && first !== "off") return undefined
    setFallback(first === "on")
    process.stdout.write(`fallback ${first}\n`)
    return 0
  },
  log: ([first]) => {
    if (first !== "on" && first !== "off") return undefined
    setLog(first === "on")
    process.stdout.write(`log ${first}\n`)
    return 0
  },
  version: printVersion,
  "--version": printVersion,
}

const commandOf = (command: string | undefined): Command | undefined =>
  command !== undefined && Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined

const main = async (): Promise<number> => {
  const [command, ...rest] = process.argv.slice(2)
  if (isMode(command)) {
    await runWorker(command, rest)
    return 0
  }
  if (command === "doctor") return doctor()
  const code = commandOf(command)?.(rest)
  if (code !== undefined) return code
  const asked = HELP.includes(command)
  const stream = asked ? process.stdout : process.stderr
  stream.write(USAGE)
  return asked ? 0 : 1
}

try {
  process.exitCode = await main()
} catch (error) {
  if (error instanceof Refusal) record("fail", { text: error.message })
  else crashed("cli", error)
  process.stderr.write(`Error: ${messageOf(error)}\n`)
  process.exitCode = 1
}
