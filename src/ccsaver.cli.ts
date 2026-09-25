import { readFileSync } from "node:fs"
import { marked, scrubbed, shown, type Tone } from "./cli/terminal.reporter.ts"
import {
  atMost,
  type Command,
  mistake,
  type Outcome,
  only,
  onOff,
  tooMany,
  USAGE,
} from "./cli/usage.reporter.ts"
import { isMode, runWorker } from "./delegation/delegation.service.ts"
import { setClaude, setFallback, writeWorker } from "./delegation/worker.store.ts"
import { doctor } from "./doctor/doctor.service.ts"
import { writeLauncher } from "./doctor/environment.service.ts"
import type { Limits } from "./measure/measure.helpers.ts"
import { proposalOf, surveyFor } from "./measure/survey.service.ts"
import {
  listedPrices,
  MODEL_NAME,
  readPrices,
  shownPrices,
  WORKER,
  writePrice,
} from "./saved/prices.store.ts"
import { report } from "./saved/saved.reporter.ts"
import {
  LIMIT_CEILING,
  limitsFor,
  plug,
  readPlugged,
  unplug,
  writeLimits,
} from "./state/config.store.ts"
import {
  HANDOFF_MARGIN,
  handoffDir,
  handoffPoint,
  keepHandoff,
  keptHandoffs,
  latestHandoff,
  readHandoff,
  setHandoff,
} from "./state/handoff.store.ts"
import { crashed, logDir, MONTH, ownVersion, record, setLog } from "./state/log.store.ts"
import { messageOf, Refusal } from "./state/state.store.ts"

const HELP = ["help", "--help", "-h"]
const LIMIT_KEYS = ["maxLines", "maxTokens"] as const
const OWN_CLAUDE = "the session's own claude runs the fallback"
const HAIKU = "a call the worker cannot take"
const HANDOFF_ON = "the session hands off by itself at the point under the limit"
const HANDOFF_OFF = "no handoff point; /ccsaver:handoff still works by hand"

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

const printVersion: Command = (): Outcome => done("info", ownVersion())

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

const handoffShown = (): number => {
  const { on, limit } = readHandoff()
  const kept = keptHandoffs()
  const where =
    kept.length === 0
      ? `nothing kept yet in ${handoffDir()}`
      : `${kept.length} kept in ${handoffDir()}, the latest ${latestHandoff()}`
  return done(
    "info",
    `handoff ${on ? "on" : "off"} · limit ${limit} tokens · hands off at ${handoffPoint(limit)} (margin ${HANDOFF_MARGIN}) · ${where}`,
  )
}

const handoffKept = (): number => {
  const session = process.env["CLAUDE_CODE_SESSION_ID"] || undefined
  const { place, lines, bytes, replaced } = keepHandoff(readFileSync(0, "utf8"), session)
  const verb = replaced ? "replaced" : "kept"
  say("ok", `handoff ${verb} in ${place} (${lines} lines, ${bytes} bytes)`)
  say(
    "info",
    `next session, in a terminal: claude "Read ${place} whole, then continue from its next step"`,
  )
  say("info", "in VS Code: open a new conversation and type that same line")
  say("info", `Read ${place} whole, then continue from its next step`)
  return 0
}

const handoffSwitched = (first: "on" | "off"): number => {
  const on = first === "on"
  const means = on ? HANDOFF_ON : HANDOFF_OFF
  return setHandoff({ on }).changed
    ? done("ok", `handoff ${first}: ${means}`)
    : done("info", `the handoff is already ${first}: ${means}`)
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
  handoff: atMost("handoff", 1, ([first]) => {
    if (first === undefined) return handoffShown()
    if (first === "write") return handoffKept()
    if (first === "on" || first === "off") return handoffSwitched(first)
    if (!/^[1-9][0-9]*$/.test(first))
      return `handoff takes on, off, write or a number of tokens, not: ${first}`
    const limit = Number(first)
    if (limit <= HANDOFF_MARGIN)
      return `handoff takes a limit above its ${HANDOFF_MARGIN}-token margin, not: ${first}`
    const { before, changed } = setHandoff({ limit })
    return changed
      ? done("ok", `handoff limit ${limit} tokens (was ${before.limit})`)
      : done("info", `the handoff limit is already ${limit} tokens`)
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
      return `a model name takes letters, digits and . _ - : @ /, as Anthropic, Bedrock and Vertex write them; not: ${first}`
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
      return "key set belongs to the launcher: run ccsaver key set, not node src/ccsaver.cli.ts"
    return only("key", "set", first)
  }),
  launcher: atMost("launcher", 1, ([first]) => {
    if (first !== "write") return only("launcher", "write", first)
    const { place, was, advice } = writeLauncher()
    if (was === "current") say("info", `the launcher is already at ${place}`)
    else {
      say(
        "ok",
        was === "nothing"
          ? `launcher written to ${place}`
          : `launcher replaced at ${place} (an older launcher of ccsaver's)`,
      )
      say("info", "in a new terminal: ccsaver version")
    }
    for (const line of advice) warn(line)
    return 0
  }),
  version: atMost("version", 0, printVersion),
  "--version": atMost("--version", 0, printVersion),
}

const commandOf = (command: string): Command | undefined =>
  Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined

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
