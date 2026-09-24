// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { isRecord, messageOf, parsed } from "../state/state.store.ts"
import {
  CHARS_PER_TOKEN,
  type Delegation,
  delegation,
  fail,
  note,
  tokensOf,
} from "./worker.client.ts"
import type { Worker } from "./worker.store.ts"

const FALLBACK_MODEL = "haiku"
const FALLBACK_BUDGET_USD = "0.5"
const NO_MCP_SERVERS = '{"mcpServers":{}}'
const BARE_ENV = {
  MAX_THINKING_TOKENS: "0",
  CLAUDE_CODE_EFFORT_LEVEL: "low",
  CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1",
  CLAUDE_CODE_PROMPT_CACHE_TTL: "5m",
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
} as const
const BARE_SETTINGS = JSON.stringify({ disableAllHooks: true, env: BARE_ENV })
const FALLBACK_TIMEOUT_MS = 85_000
const FALLBACK_MAX_CHARS = 400_000

export const CLAUDE_ON_PATH = "claude"

export const claudeBin = (worker: Worker | undefined): string =>
  worker?.claude ?? (process.env["CLAUDE_CODE_EXECPATH"] || CLAUDE_ON_PATH)

const reasonOf = (raw: unknown): string | undefined => {
  if (!isRecord(raw) || raw["is_error"] !== true) return undefined
  if (typeof raw["result"] === "string") return raw["result"]
  const first: unknown = Array.isArray(raw["errors"]) ? raw["errors"][0] : undefined
  return typeof first === "string" ? first : String(raw["subtype"])
}

export const troubleOf = (error: unknown): string | undefined => {
  const code = isRecord(error) ? error["code"] : undefined
  if (code === "ETIMEDOUT") return `fallback worker timed out after ${FALLBACK_TIMEOUT_MS / 1000} s`
  if (code === "EPIPE" || error === undefined) return undefined
  return `fallback worker could not run: ${messageOf(error)}`
}

export const invokeClaude = (
  mode: string,
  system: string,
  message: string,
  worker: Worker | undefined,
): string => {
  if (message.length > FALLBACK_MAX_CHARS)
    return fail(
      `the files are ~${tokensOf(message)} tokens by chars/4, over the ${FALLBACK_MAX_CHARS / CHARS_PER_TOKEN} the Haiku fallback takes: ask about fewer files`,
    )
  const started = performance.now()
  const run = spawnSync(
    claudeBin(worker),
    [
      "-p",
      "--model",
      FALLBACK_MODEL,
      "--system-prompt",
      system,
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      NO_MCP_SERVERS,
      "--disable-slash-commands",
      "--no-session-persistence",
      "--max-budget-usd",
      FALLBACK_BUDGET_USD,
      "--settings",
      BARE_SETTINGS,
      "--output-format",
      "json",
    ],
    {
      input: message,
      cwd: tmpdir(),
      encoding: "utf8",
      timeout: FALLBACK_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...BARE_ENV },
    },
  )
  delegation.fallbackMs = Math.round(performance.now() - started)
  const trouble = troubleOf(run.error)
  if (trouble !== undefined) return fail(trouble)
  const raw = parsed(run.stdout)
  const reason = reasonOf(raw)
  if (reason !== undefined) return fail(`fallback worker failed: ${reason.slice(0, 400)}`)
  if (run.status !== 0)
    return fail(`fallback worker exited ${run.status ?? run.signal}: ${run.stderr.slice(0, 400)}`)
  if (!isRecord(raw) || typeof raw["result"] !== "string")
    return fail(`fallback worker returned no result: ${run.stdout.slice(0, 200)}`)
  const cost = typeof raw["total_cost_usd"] === "number" ? raw["total_cost_usd"] : null
  Object.assign(delegation, {
    answered: "fallback",
    model: FALLBACK_MODEL,
    answerChars: raw["result"].length,
    cost,
  } satisfies Delegation)
  note(
    `~${tokensOf(message)} input tokens by chars/4 | $${cost?.toFixed(4) ?? "?"} | ${FALLBACK_MODEL} | delegated to ${mode}`,
  )
  return raw["result"]
}
