import { readFileSync } from "node:fs"
import { lastAssistantOf } from "./state/config.store.ts"
import { readHandoff, readTier, writeTier } from "./state/handoff.store.ts"
import { crashed, record } from "./state/log.store.ts"
import { isRecord } from "./state/state.store.ts"

const TRANSCRIPT_TAIL = 262_144

const grouped = (tokens: number): string => String(tokens).replace(/\B(?=(\d{3})+(?!\d))/g, ",")

const warning = (model: string | undefined, context: number, limit: number, tier: number): string =>
  `ccsaver: ${model ?? "the session"} has ${grouped(context)} tokens in context, past ${tier === 1 ? "" : `${tier}× `}the ${grouped(limit)} handoff limit. Run /ccsaver:handoff to write a handoff and continue in a new session; ccsaver handoff <tokens> moves the limit, ccsaver handoff off silences it.`

const watch = (): void => {
  const input: unknown = JSON.parse(readFileSync(0, "utf8"))
  const call = isRecord(input) ? input : {}
  const session = call["session_id"]
  if (typeof session !== "string" || session === "") return
  const { on, limit } = readHandoff()
  if (!on) return
  const spoken = lastAssistantOf(call["transcript_path"], TRANSCRIPT_TAIL)
  if (spoken?.context === undefined) return
  const tier = Math.floor(spoken.context / limit)
  const warned = readTier(session) ?? 0
  if (tier < warned) {
    writeTier(session, tier)
    return
  }
  if (tier <= warned) return
  writeTier(session, tier)
  process.stdout.write(
    JSON.stringify({ systemMessage: warning(spoken.model, spoken.context, limit, tier) }),
  )
  record(
    "handoff",
    { action: "warned", context: spoken.context, limit, tier, model: spoken.model ?? null },
    session,
  )
}

try {
  watch()
} catch (error) {
  crashed("handoff", error)
}
