import { readFileSync } from "node:fs"
import { join } from "node:path"
import { setClaude, setFallback, writeWorker } from "./delegation/endpoint.ts"
import { shown } from "./delegation/transport.ts"
import { isMode, runWorker } from "./delegation/worker.ts"
import { doctor } from "./doctor/doctor.ts"
import { proposalOf, surveyFor } from "./doctor/survey.ts"
import {
  listedPrices,
  MODEL_NAME,
  readPrices,
  shownPrices,
  WORKER,
  writePrice,
} from "./saved/prices.ts"
import { report } from "./saved/report.ts"
import {
  LIMIT_CEILING,
  type Limits,
  limitsFor,
  plug,
  readPlugged,
  unplug,
  writeLimits,
} from "./state/config.ts"
import { crashed, logDir, MONTH, record, setLog } from "./state/log.ts"
import {
  attempt,
  isRecord,
  marked,
  messageOf,
  parsed,
  Refusal,
  scrubbed,
  type Tone,
} from "./state/state.ts"

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
const OWN_CLAUDE = "the session's own claude runs the fallback"
const HAIKU = "a call the worker cannot take"

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

const say = (tone: Tone, text: string): void => {
  process.stdout.write(`${marked(tone, "", scrubbed(text))}\n`)
}

const done = (tone: Tone, text: string): number => {
  say(tone, text)
  return 0
}

const warn = (text: string): void => {
  process.stderr.write(`${marked("warn", "warn:", scrubbed(text), process.stderr)}\n`)
}

type Outcome = number | string

type Command = (rest: string[]) => Outcome

const tooMany = (name: string, most: number, rest: string[]): string | undefined => {
  if (rest.length <= most) return undefined
  const takes = most === 0 ? "no arguments" : `at most ${most} argument${most === 1 ? "" : "s"}`
  return `${name} takes ${takes}, not ${rest.length}: ${rest.join(" ")}`
}

const atMost =
  (name: string, most: number, run: Command): Command =>
  (rest: string[]): Outcome =>
    tooMany(name, most, rest) ?? run(rest)

const onOff = (name: string, first: string | undefined): string =>
  first === undefined ? `${name} needs on or off` : `${name} takes on or off, not: ${first}`

const printVersion: Command = (): Outcome => done("info", version())

const pinned = (given: string): number => {
  const { pinned, was } = setClaude(given === "auto" ? undefined : given)
  if (pinned === was)
    return done(
      "info",
      pinned === undefined
        ? `the fallback binary was not pinned: ${OWN_CLAUDE}`
        : `the fallback binary is already pinned: ${pinned}`,
    )
  const before = was === undefined ? "" : ` (was ${was})`
  return pinned === undefined
    ? done("ok", `fallback binary unpinned${before}: ${OWN_CLAUDE}`)
    : done("ok", `fallback binary pinned: ${pinned}${before}`)
}

const COMMANDS: Record<string, Command> = {
  plug: atMost("plug", 2, ([first, second]) => {
    const { entry, was } = plug(first ?? process.cwd(), second)
    const { root, adapter } = entry
    const measured = proposalOf(surveyFor(root), limitsFor(adapter), root, adapter)
    const named = `adapter ${adapter ?? "none"}`
    if (was !== undefined && was.adapter === adapter)
      return done("info", `${root} is already plugged in · ${named}\n${measured}`)
    const before = was === undefined ? "" : ` (was ${was.adapter ?? "none"})`
    return done("ok", `plugged ${root} · ${named}${before}\n${measured}`)
  }),
  adapter: ([first, ...pairs]) => {
    if (first === undefined) return "adapter needs a name, then maxLines=<n> or maxTokens=<n>"
    const limits = limitsGiven(pairs)
    const { place, changed } = writeLimits(first, limits)
    if (changed) return done("ok", `adapter ${first} written to ${place}`)
    const held = Object.entries(limits)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ")
    return done("info", `adapter ${first} already holds ${held}, nothing changed`)
  },
  unplug: atMost("unplug", 1, ([first]) => {
    if (!first) return "unplug needs the directory to unplug"
    return unplug(first)
      ? done("ok", `unplugged ${first}`)
      : done("info", `${first} is not plugged in, nothing changed`)
  }),
  list: atMost("list", 0, () => {
    const entries = readPlugged()
    if (entries.length === 0) return done("info", "nothing is plugged in")
    const rows = entries.map(({ root, adapter }) => `${root}\t${adapter ?? ""}\n`).join("")
    process.stdout.write(scrubbed(rows))
    return 0
  }),
  worker: atMost("worker", 3, ([first, second, third]) => {
    if (first === "claude")
      return second === undefined ? "worker claude needs a path, or auto" : pinned(second)
    if (first !== "set")
      return first === undefined
        ? "worker needs set or claude"
        : `worker takes set or claude, not: ${first}`
    if (second === undefined || third === undefined) return "worker set needs <url> <model>"
    const { changed, advice } = writeWorker(second, third)
    const named = `${shown(second)} · ${third}`
    if (!changed) return done("info", `the worker is already ${named}, nothing changed`)
    say("ok", `worker set to ${named}`)
    if (advice !== undefined) warn(advice)
    return 0
  }),
  fallback: atMost("fallback", 1, ([first]) => {
    if (first !== "on" && first !== "off") return onOff("fallback", first)
    const on = first === "on"
    const means = on
      ? `${HAIKU} goes to paid Claude Haiku`
      : `${HAIKU} fails instead of going to paid Claude Haiku`
    return setFallback(on)
      ? done("ok", `fallback ${first}: ${means}`)
      : done("info", `the fallback is already ${first}: ${means}`)
  }),
  log: atMost("log", 1, ([first]) => {
    if (first !== "on" && first !== "off") return onOff("log", first)
    const on = first === "on"
    const where = on
      ? `recording metadata only in ${logDir()}`
      : `the events so far are kept in ${logDir()}.off`
    return setLog(on)
      ? done("ok", `log ${first}: ${where}`)
      : done("info", `the log is already ${first}`)
  }),
  saved: atMost("saved", 1, ([first]) => {
    if (first !== undefined && first !== "all" && !MONTH.test(first))
      return `saved takes a month, YYYY-MM, or all; not: ${first}`
    process.stdout.write(report(first))
    return 0
  }),
  price: atMost("price", 2, ([first, second]) => {
    if (first === undefined) {
      process.stdout.write(scrubbed(listedPrices(readPrices())))
      return 0
    }
    if (first !== WORKER && !MODEL_NAME.test(first))
      return `a model name takes lowercase letters, digits, dots, dashes and underscores; not: ${first}`
    if (second === undefined)
      return `price needs the dollars per million after ${first}: ccsaver price ${first} <usd>`
    const dollars = Number(second)
    const free = first === WORKER && dollars === 0
    if (!Number.isFinite(dollars) || (dollars <= 0 && !free))
      throw new Refusal(
        `a price is dollars per million input tokens, a positive number, and 0 only for a worker that is free; not: ${second}`,
      )
    const { prices, was } = writePrice(first, dollars)
    const all = shownPrices(prices)
    if (was === dollars) return done("info", `${first} is already $${dollars}/M · ${all}`)
    const before = was === undefined ? "" : ` (was $${was}/M)`
    return done("ok", `price ${first} $${dollars}/M${before} · ${all}`)
  }),
  key: atMost("key", 1, ([first]) => {
    if (first === "set")
      return "key set belongs to the launcher: run ccsaver key set, not node src/cli.ts"
    return first === undefined ? "key needs set: ccsaver key set" : `key takes set, not: ${first}`
  }),
  version: atMost("version", 0, printVersion),
  "--version": atMost("--version", 0, printVersion),
}

const commandOf = (command: string): Command | undefined =>
  Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined

const usageFor = (command: string): string[] =>
  USAGE.split("\n").filter(
    (line) => line.startsWith(`  ${command} `) || line.trimEnd() === `  ${command}`,
  )

const mistake = (command: string, complaint: string): number => {
  const lines = usageFor(command.replace(/^-+/, ""))
  const usage =
    lines.length === 0
      ? USAGE
      : `${lines.map((line, at) => `${at === 0 ? "usage:" : "      "} ccsaver ${line.trimStart()}`).join("\n")}\n`
  process.stderr.write(`${marked("fail", "Error:", scrubbed(complaint), process.stderr)}\n${usage}`)
  record("fail", { text: complaint })
  return 1
}

const main = async (): Promise<number> => {
  const [command, ...rest] = process.argv.slice(2)
  if (isMode(command)) {
    await runWorker(command, rest)
    return 0
  }
  if (command === undefined || HELP.includes(command)) {
    process.stdout.write(USAGE)
    return 0
  }
  if (command === "doctor") {
    const wrong = tooMany(command, 0, rest)
    return wrong === undefined ? doctor() : mistake(command, wrong)
  }
  const outcome = commandOf(command)?.(rest)
  if (typeof outcome === "number") return outcome
  return mistake(command, outcome ?? `unknown command: ${command}`)
}

try {
  process.exitCode = await main()
} catch (error) {
  if (error instanceof Refusal) record("fail", { text: error.message })
  else crashed("cli", error)
  process.stderr.write(`${marked("fail", "Error:", scrubbed(messageOf(error)), process.stderr)}\n`)
  process.exitCode = 1
}
