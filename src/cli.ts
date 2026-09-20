import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  LIMIT_CEILING,
  type Limits,
  limitsFor,
  plug,
  readPlugged,
  unplug,
  writeLimits,
} from "./config.ts"
import { doctor } from "./doctor.ts"
import { setClaude, setFallback, writeWorker } from "./endpoint.ts"
import { crashed, MONTH, record, setLog } from "./log.ts"
import { listedPrices, MODEL_NAME, readPrices, shownPrices, WORKER, writePrice } from "./prices.ts"
import { report } from "./report.ts"
import { attempt, isRecord, messageOf, parsed, Refusal, scrubbed } from "./state.ts"
import { proposalOf, surveyFor } from "./survey.ts"
import { shown } from "./transport.ts"
import { isMode, runWorker } from "./worker.ts"

const HEAD = "usage: ccsaver <command>"

const USAGE = `${HEAD}

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
  saved [month|all]          what the log says it cost, and what it would have cost without
  price <model>|worker <usd> dollars per million input tokens; price alone lists them
  doctor                     check permissions, key, worker, fallback and projects
  version                    print the version

  bulk-read  --question=<q> --paths <file>... [--project <dir>]
  code-write --spec=<s> --reference <file>... [--target <out>] [--project <dir>]
`

const PACKAGE = join(import.meta.dirname, "..", "package.json")
const HELP = ["help", "--help", "-h"]
const LIMIT_KEYS = ["maxLines", "maxTokens"] as const

const limitsGiven = (pairs: string[]): Partial<Limits> => {
  const given = pairs.map((pair) => pair.split("="))
  const wrong = given.filter(
    ([key, value, extra]) =>
      !LIMIT_KEYS.some((known) => known === key) ||
      extra !== undefined ||
      !/^[1-9][0-9]*$/.test(value ?? "") ||
      Number(value) > LIMIT_CEILING,
  )
  if (given.length === 0)
    throw new Refusal(`ccsaver adapter <name> needs ${LIMIT_KEYS.join("=<n> or ")}=<n>`)
  if (wrong.length > 0)
    throw new Refusal(
      `${LIMIT_KEYS.join("=<n> and ")}=<n>, n a positive integer up to ${LIMIT_CEILING}; not: ${wrong.map((parts) => parts.join("=")).join(" ")}`,
    )
  return Object.fromEntries(given.map(([key, value]) => [key, Number(value)]))
}

const version = (): string => {
  const raw = parsed(attempt(() => readFileSync(PACKAGE, "utf8")) ?? "")
  return isRecord(raw) && typeof raw["version"] === "string" ? raw["version"] : "unknown"
}

const say = (text: string): void => {
  process.stdout.write(scrubbed(text))
}

type Outcome = number | undefined

type Command = (rest: string[]) => Outcome

const atMost =
  (most: number, run: Command): Command =>
  (rest: string[]): Outcome =>
    rest.length > most ? undefined : run(rest)

const printVersion: Command = (): Outcome => {
  say(`${version()}\n`)
  return 0
}

const COMMANDS: Record<string, Command> = {
  plug: atMost(2, ([first, second]) => {
    const { root, adapter } = plug(first ?? process.cwd(), second)
    const limits = limitsFor(adapter)
    say(
      `plugged ${root} · adapter ${adapter ?? "none"}\n${proposalOf(surveyFor(root), limits, root, adapter)}\n`,
    )
    return 0
  }),
  adapter: ([first, ...pairs]) => {
    if (first === undefined) return undefined
    const place = writeLimits(first, limitsGiven(pairs))
    say(`adapter ${first} written to ${place}\n`)
    return 0
  },
  unplug: atMost(1, ([first]) => {
    if (first === undefined) return undefined
    say(unplug(first) ? `unplugged ${first}\n` : `${first} was not plugged\n`)
    return 0
  }),
  list: atMost(0, () => {
    const entries = readPlugged()
    say(
      entries.length === 0
        ? "nothing is plugged in\n"
        : entries.map(({ root, adapter }) => `${root}\t${adapter ?? ""}\n`).join(""),
    )
    return 0
  }),
  worker: atMost(3, ([first, second, third]) => {
    if (first === "claude" && second !== undefined) {
      const pinned = setClaude(second === "auto" ? undefined : second)
      say(`fallback binary: ${pinned ?? "the session's own claude"}\n`)
      return 0
    }
    if (first !== "set" || second === undefined || third === undefined) return undefined
    const advice = writeWorker(second, third)
    say(`worker set to ${shown(second)} · ${third}\n`)
    if (advice !== undefined) process.stderr.write(scrubbed(`warn: ${advice}\n`))
    return 0
  }),
  fallback: atMost(1, ([first]) => {
    if (first !== "on" && first !== "off") return undefined
    setFallback(first === "on")
    say(`fallback ${first}\n`)
    return 0
  }),
  log: atMost(1, ([first]) => {
    if (first !== "on" && first !== "off") return undefined
    setLog(first === "on")
    say(`log ${first}\n`)
    return 0
  }),
  saved: atMost(1, ([first]) => {
    if (first !== undefined && first !== "all" && !MONTH.test(first)) return undefined
    process.stdout.write(report(first))
    return 0
  }),
  price: atMost(2, ([first, second]) => {
    if (first === undefined) {
      say(listedPrices(readPrices()))
      return 0
    }
    if (second === undefined) return undefined
    if (first !== WORKER && !MODEL_NAME.test(first)) return undefined
    const dollars = Number(second)
    const free = first === WORKER && dollars === 0
    if (!Number.isFinite(dollars) || (dollars <= 0 && !free))
      throw new Refusal(
        `a price is dollars per million input tokens, a positive number, and 0 only for a worker that is free; not: ${second}`,
      )
    say(`price ${first} $${dollars}/M · ${shownPrices(writePrice(first, dollars))}\n`)
    return 0
  }),
  version: atMost(0, printVersion),
  "--version": atMost(0, printVersion),
}

const commandOf = (command: string | undefined): Command | undefined =>
  command !== undefined && Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined

const usageFor = (command: string): string[] =>
  USAGE.split("\n").filter(
    (line) => line.startsWith(`  ${command} `) || line.trimEnd() === `  ${command}`,
  )

const main = async (): Promise<number> => {
  const [command, ...rest] = process.argv.slice(2)
  if (isMode(command)) {
    await runWorker(command, rest)
    return 0
  }
  if (command === "doctor" && rest.length === 0) return doctor()
  const code = commandOf(command)?.(rest)
  if (code !== undefined) return code
  if (command === undefined || HELP.includes(command)) {
    process.stdout.write(USAGE)
    return 0
  }
  const only = usageFor(command)
  const known = command === "doctor" || commandOf(command) !== undefined
  const wrong = known || only.length > 0 ? "wrong arguments" : "unknown command"
  const said =
    only.length === 0 ? `${wrong}: ${command}\n${USAGE}` : `${HEAD}\n\n${only.join("\n")}\n`
  process.stderr.write(scrubbed(said))
  record("fail", { text: `${wrong}: ${command}` })
  return 1
}

try {
  process.exitCode = await main()
} catch (error) {
  if (error instanceof Refusal) record("fail", { text: error.message })
  else crashed("cli", error)
  process.stderr.write(scrubbed(`Error: ${messageOf(error)}\n`))
  process.exitCode = 1
}
