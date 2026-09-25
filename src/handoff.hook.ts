import { readFileSync } from "node:fs"
import { join } from "node:path"
import { lastAssistantOf, type Spoken } from "./measure/transcript.reader.ts"
import {
  BATCH_UNIT,
  clearAsked,
  type HandoffState,
  handoffPlace,
  handoffPoint,
  readAsked,
  readHandoff,
  stateOf,
  writeAsked,
} from "./state/handoff.store.ts"
import { crashed, record } from "./state/log.store.ts"
import { attempt, isRecord, plural } from "./state/state.store.ts"

const TRANSCRIPT_TAIL = 262_144
const WAIT_MS = 2_000
const POLL_MS = 50
const FRESH_MS = 2_000
const SKILL = join(import.meta.dirname, "..", "commands", "handoff.md")
const FRONT_MATTER = /^---\n[\s\S]*?\n---\n+/
const GIT_READS = /^git (status|log|describe)( [^;&|<>`$\n]*)?$/
const SLEEPER = new Int32Array(new SharedArrayBuffer(4))

type Input = Record<PropertyKey, unknown>

interface Call {
  session: string
  input: Input
  limit: number
}

const grouped = (tokens: number): string => String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ",")

const pasteLine = (session: string): string =>
  `Read ${handoffPlace(session)} whole, then continue from its next step`

const skillBody = (): string => {
  const body = (attempt(() => readFileSync(SKILL, "utf8")) ?? "").replace(FRONT_MATTER, "")
  return body === "" ? "Invoke the ccsaver:handoff skill." : body
}

const request = (spoken: Spoken, size: number, limit: number): string =>
  `ccsaver: ${spoken.model ?? "the session"} has ${grouped(size)} tokens in context, its last response counted, at the ${grouped(handoffPoint(limit))} handoff point of the ${grouped(limit)} limit. No other tool runs in this session until the handoff is written; write it now, this way.\n\n${skillBody()}`

const notice = (size: number, limit: number): string =>
  `ccsaver: handing off at ${grouped(size)} tokens, the ${grouped(limit)} limit`

const onlyHandoff = (size: number, limit: number): string =>
  `ccsaver: ${grouped(size)} tokens in context, past the ${grouped(handoffPoint(limit))} handoff point: only the handoff runs in this session. git status, git log, git describe and ccsaver handoff write pass; write the handoff now, then end the turn with the line that opens the next session, alone in a code block.`

const handedOff = (size: number, limit: number): string =>
  `ccsaver: this session was handed off at ${grouped(size)} tokens, the ${grouped(limit)} limit.`

const cut = (size: number, limit: number, passed: number): string =>
  `ccsaver: ${grouped(size)} tokens in context, near the ${grouped(handoffPoint(limit))} handoff point: this batch was cut to ${plural(passed, "call")}; call the rest again, fewer at a time.`

const say = (output: object): void => {
  process.stdout.write(JSON.stringify(output))
}

const deny = (reason: string, systemMessage?: string): void => {
  say({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
    ...(systemMessage === undefined ? {} : { systemMessage }),
  })
}

const context = (event: string, additionalContext: string): void => {
  say({ hookSpecificOutput: { hookEventName: event, additionalContext } })
}

const passes = (input: Input): boolean => {
  const asked = isRecord(input["tool_input"]) ? input["tool_input"] : {}
  if (input["tool_name"] === "Skill") return asked["skill"] === "ccsaver:handoff"
  const command = asked["command"]
  if (input["tool_name"] !== "Bash" || typeof command !== "string") return false
  const bare = command.trim()
  return bare.startsWith("ccsaver handoff write") || GIT_READS.test(bare)
}

const indexOf = (call: Call, spoken: Spoken): number => {
  const id = call.input["tool_use_id"]
  return typeof id === "string" ? spoken.toolUses.indexOf(id) : -1
}

const asked = (call: Call, spoken: Spoken, size: number, event: string): void => {
  writeAsked(call.session, size)
  record(
    "handoff",
    {
      action: "asked",
      context: spoken.context,
      output: spoken.output,
      limit: call.limit,
      at: handoffPoint(call.limit),
      model: spoken.model ?? null,
      event,
    },
    call.session,
  )
}

const batched = (call: Call, spoken: Spoken, size: number): void => {
  const index = indexOf(call, spoken)
  if (index <= 0) return
  const passed = Math.min(
    spoken.toolUses.length,
    Math.floor((handoffPoint(call.limit) - size) / BATCH_UNIT) + 1,
  )
  if (index < passed) return
  deny(cut(size, call.limit, passed))
  if (index === passed)
    record(
      "handoff",
      {
        action: "held",
        context: spoken.context,
        output: spoken.output,
        batch: spoken.toolUses.length,
        passed,
      },
      call.session,
    )
}

const tool = (call: Call, spoken: Spoken, size: number, state: HandoffState): void => {
  if (state === "written") {
    deny(
      `${handedOff(size, call.limit)} End the turn with this line alone in a code block, nothing after it: ${pasteLine(call.session)}`,
    )
    return
  }
  const first = indexOf(call, spoken) <= 0
  if (state === "asked") {
    if (first && readAsked(call.session) === size) {
      asked(call, spoken, size, "PreToolUse")
      deny(request(spoken, size, call.limit), notice(size, call.limit))
    } else if (!passes(call.input)) deny(onlyHandoff(size, call.limit))
    return
  }
  if (size < handoffPoint(call.limit)) {
    batched(call, spoken, size)
    return
  }
  if (!first) {
    writeAsked(call.session, size)
    deny(onlyHandoff(size, call.limit))
    return
  }
  asked(call, spoken, size, "PreToolUse")
  deny(request(spoken, size, call.limit), notice(size, call.limit))
}

const stopped = (call: Call, spoken: Spoken, size: number, state: HandoffState): void => {
  if (state === "written") {
    record(
      "handoff",
      {
        action: "done",
        context: spoken.context,
        output: spoken.output,
        limit: call.limit,
        asked: readAsked(call.session) ?? null,
      },
      call.session,
    )
    return
  }
  if (
    state === "asked" ||
    size < handoffPoint(call.limit) ||
    call.input["stop_hook_active"] === true
  )
    return
  asked(call, spoken, size, "Stop")
  context("Stop", request(spoken, size, call.limit))
}

const prompted = (call: Call, spoken: Spoken, size: number, state: HandoffState): void => {
  if (state === "written") {
    say({
      decision: "block",
      reason: `${handedOff(size, call.limit)} Paste this in a new session: ${pasteLine(call.session)}. ccsaver handoff <tokens> raises the limit; ccsaver handoff off unlocks this session.`,
    })
    return
  }
  if (size < handoffPoint(call.limit)) return
  if (state === "none") asked(call, spoken, size, "UserPromptSubmit")
  context("UserPromptSubmit", request(spoken, size, call.limit))
}

const settled = (input: Input, event: unknown, since: number): ((spoken: Spoken) => boolean) => {
  const wanted = input["tool_use_id"]
  if (event === "PreToolUse")
    return (spoken) => typeof wanted !== "string" || spoken.toolUses.includes(wanted)
  if (event === "Stop")
    return (spoken) =>
      spoken.stopReason !== "tool_use" && (spoken.at === undefined || spoken.at >= since - FRESH_MS)
  return () => true
}

const awaited = (input: Input, event: unknown, session: string): Spoken | undefined => {
  const id = input["tool_use_id"]
  const wanted = event === "PreToolUse" && typeof id === "string" ? id : undefined
  const read = (): Spoken | undefined =>
    lastAssistantOf(input["transcript_path"], TRANSCRIPT_TAIL, wanted)
  const since = Date.now()
  const done = settled(input, event, since)
  let spoken = read()
  while (spoken !== undefined && !done(spoken) && Date.now() - since < WAIT_MS) {
    Atomics.wait(SLEEPER, 0, 0, POLL_MS)
    spoken = read()
  }
  const waited = Date.now() - since
  if (spoken !== undefined && waited >= POLL_MS)
    record("handoff", { action: "waited", event, ms: waited, landed: done(spoken) }, session)
  return spoken
}

const stateAt = (session: string, size: number, limit: number): HandoffState => {
  const state = stateOf(session)
  if (state === "none" || size >= handoffPoint(limit)) return state
  clearAsked(session)
  return "none"
}

const watch = (): void => {
  const raw: unknown = JSON.parse(readFileSync(0, "utf8"))
  const input = isRecord(raw) ? raw : {}
  const session = input["session_id"]
  if (typeof session !== "string" || session === "" || typeof input["agent_id"] === "string") return
  const { on, limit } = readHandoff()
  if (!on) return
  const event = input["hook_event_name"]
  const spoken = awaited(input, event, session)
  if (spoken?.context === undefined) return
  const size = spoken.context + (spoken.output ?? 0)
  const call: Call = { session, input, limit }
  const state = stateAt(session, size, limit)
  if (event === "PreToolUse") tool(call, spoken, size, state)
  else if (event === "Stop") stopped(call, spoken, size, state)
  else if (event === "UserPromptSubmit") prompted(call, spoken, size, state)
}

try {
  watch()
} catch (error) {
  crashed("handoff", error)
}
