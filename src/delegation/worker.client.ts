// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { spawnSync } from "node:child_process"
import { writeSync } from "node:fs"
import { tmpdir } from "node:os"
import { record } from "../state/log.store.ts"
import {
  attempt,
  hidden,
  isEncrypted,
  isRecord,
  keyFile,
  keyIsCarriable,
  keyIsStored,
  keyWasMoved,
  marked,
  messageOf,
  movedKeyFile,
  parsed,
  readKey,
  scrubbed,
  shown,
} from "../state/state.store.ts"
import type { Tally } from "./answer.validator.ts"
import type { Worker } from "./worker.store.ts"

const FALLBACK_MODEL = "haiku"
const FALLBACK_BUDGET_USD = "0.5"
const NO_MCP_SERVERS = '{"mcpServers":{}}'
const BARE_ENV = {
  MAX_THINKING_TOKENS: "0",
  CLAUDE_CODE_EFFORT_LEVEL: "low",
  CLAUDE_CODE_DISABLE_TERMINAL_TITLE: "1",
  CLAUDE_CODE_PROMPT_CACHE_TTL: "5m",
} as const
const BARE_SETTINGS = JSON.stringify({ disableAllHooks: true, env: BARE_ENV })
const FALLBACK_TIMEOUT_MS = 85_000
const EXTERNAL_TIMEOUT_MS = 30_000
const FALLBACK_MAX_CHARS = 400_000
const MAX_ANSWER_TOKENS = 8192
const BULK_READ_ANSWER_TOKENS = 2048
const MAX_BODY_BYTES = 4 * 1024 * 1024
const CHARS_PER_TOKEN = 4
const TEMPERATURE = 0.2

type Fell = "timeout" | "not json" | "unreachable" | "redirect"

export const CLAUDE_ON_PATH = "claude"

export interface Delegation {
  root?: string
  adapter?: string | null
  files?: number
  outside?: number
  chars?: number
  fell?: string
  status?: number
  answered?: string
  model?: string
  answerChars?: number
  inTokens?: number
  cost?: number | null
  externalMs?: number
  fallbackMs?: number
  cited?: Tally
  target?: boolean
  format?: string
  written?: number
  risky?: number
}

export const delegation: Delegation = {}

const said = (text: string): void => {
  const clean = hidden(text)
  if (attempt(() => writeSync(2, clean)) === undefined) process.stderr.write(clean)
}

export const fail: (message: string) => never = (message) => {
  record("fail", { text: message })
  said(`${marked("fail", "Error:", scrubbed(message), process.stderr)}\n`)
  process.exit(1)
}

export const note = (text: string): void => {
  record("note", { text })
  said(`${marked("info", "", scrubbed(`[ccsaver: ${text}]`), process.stderr)}\n`)
}

export const claudeBin = (worker: Worker | undefined): string =>
  worker?.claude ?? (process.env["CLAUDE_CODE_EXECPATH"] || CLAUDE_ON_PATH)

const tokensOf = (message: string): number => Math.round(message.length / CHARS_PER_TOKEN)

const reasonOf = (raw: unknown): string | undefined => {
  if (!isRecord(raw) || raw["is_error"] !== true) return undefined
  if (typeof raw["result"] === "string") return raw["result"]
  const first: unknown = Array.isArray(raw["errors"]) ? raw["errors"][0] : undefined
  return typeof first === "string" ? first : String(raw["subtype"])
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

const answerTokensOf = (mode: string): number =>
  mode === "bulk-read" ? BULK_READ_ANSWER_TOKENS : MAX_ANSWER_TOKENS

export const requestOf = (
  model: string,
  system: string,
  message: string,
  most = MAX_ANSWER_TOKENS,
): Record<string, unknown> => ({
  model,
  temperature: TEMPERATURE,
  max_tokens: most,
  messages: [
    { role: "system", content: system },
    { role: "user", content: message },
  ],
})

export const troubleOf = (error: unknown): string | undefined => {
  const code = isRecord(error) ? error["code"] : undefined
  if (code === "ETIMEDOUT") return `fallback worker timed out after ${FALLBACK_TIMEOUT_MS / 1000} s`
  if (code === "EPIPE" || error === undefined) return undefined
  return `fallback worker could not run: ${messageOf(error)}`
}

export const postJson = (
  url: string,
  key: string,
  body: Record<string, unknown>,
  waitMs: number,
): Promise<Response> =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(waitMs),
    redirect: "error",
    body: JSON.stringify(body),
  })

export const fellOf = (error: unknown): Fell => {
  if (error instanceof Error && error.name === "TimeoutError") return "timeout"
  if (error instanceof SyntaxError) return "not json"
  const cause = isRecord(error) ? error["cause"] : undefined
  return isRecord(cause) && String(cause["message"]).includes("redirect")
    ? "redirect"
    : "unreachable"
}

const firstChoice = (raw: unknown): Record<PropertyKey, unknown> | undefined => {
  if (!isRecord(raw) || !Array.isArray(raw["choices"])) return undefined
  const first: unknown = raw["choices"][0]
  return isRecord(first) ? first : undefined
}

const isCutShort = (raw: unknown): boolean => firstChoice(raw)?.["finish_reason"] === "length"

const textOf = (content: unknown): string => {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .flatMap((part) => (isRecord(part) && typeof part["text"] === "string" ? [part["text"]] : []))
    .join("")
}

const contentOf = (raw: unknown): string | undefined => {
  const first = firstChoice(raw)
  if (first === undefined || !isRecord(first["message"]) || first["finish_reason"] === "length")
    return undefined
  const text = textOf(first["message"]["content"])
  return text.length > 0 ? text : undefined
}

const bodyOf = async (response: Response, most: number): Promise<string | undefined> => {
  const parts: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.length
    if (size > most) return undefined
    parts.push(chunk)
  }
  return Buffer.concat(parts).toString("utf8")
}

const inTokensOf = (raw: unknown): number | undefined => {
  const usage = isRecord(raw) ? raw["usage"] : undefined
  const tokens = isRecord(usage) ? usage["prompt_tokens"] : undefined
  return typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0 ? tokens : undefined
}

const next = (worker: Worker): string =>
  worker.fallback === false ? "and the fallback is off" : "falling back"

const gaveNothing = (worker: Worker, response: Response, raw: unknown): void => {
  const cut = isCutShort(raw)
  delegation.fell = response.ok ? (cut ? "length" : "incomplete") : "status"
  note(
    cut
      ? `${worker.model} cut its answer short (finish_reason length), ${next(worker)}`
      : `${worker.model} answered ${response.status} without a complete result, ${next(worker)}`,
  )
}

const keyTrouble = (key: string | undefined): { fell: string; said: string } => {
  if (key !== undefined)
    return {
      fell: "key malformed",
      said: `${keyFile()} holds a character no HTTP header can carry, a line break or an accent that came with a paste (ccsaver key set)`,
    }
  const unreadable = keyIsStored()
  return {
    fell: unreadable ? "key unreadable" : "no key",
    said: unreadable
      ? `${keyFile()} cannot be read (check its owner and mode with ccsaver doctor)`
      : "no API key is stored (ccsaver key set)",
  }
}

export const invokeExternal = async (
  mode: string,
  system: string,
  message: string,
  worker: Worker | undefined,
): Promise<string | undefined> => {
  if (worker === undefined) {
    delegation.fell = "no worker"
    note("no worker is set (ccsaver worker set <url> <model>), falling back")
    return undefined
  }
  const key = readKey()
  if (key === undefined && keyWasMoved()) {
    delegation.fell = "key moved"
    return fail(
      `the worker moved to ${shown(worker.url)} and the key was set aside in ${movedKeyFile()}: run ccsaver key set`,
    )
  }
  if (key === undefined || !keyIsCarriable(key)) {
    const { fell, said } = keyTrouble(key)
    delegation.fell = fell
    note(`${said}, ${next(worker)}`)
    return undefined
  }
  if (!isEncrypted(worker.url)) {
    delegation.fell = "not https"
    note(`the worker url is not https, ${next(worker)}`)
    return undefined
  }
  const started = performance.now()
  try {
    const response = await postJson(
      worker.url,
      key,
      requestOf(worker.model, system, message, answerTokensOf(mode)),
      EXTERNAL_TIMEOUT_MS,
    )
    delegation.status = response.status
    const text = response.ok ? await bodyOf(response, MAX_BODY_BYTES) : undefined
    const raw: unknown = JSON.parse(text ?? "null")
    const content = contentOf(raw)
    if (content === undefined) {
      gaveNothing(worker, response, raw)
      return undefined
    }
    const inTokens = inTokensOf(raw)
    Object.assign(delegation, {
      answered: "external",
      model: worker.model,
      answerChars: content.length,
      ...(inTokens === undefined ? {} : { inTokens }),
    } satisfies Delegation)
    note(
      `~${tokensOf(message)} input tokens by chars/4 | external | ${worker.model} | delegated to ${mode}`,
    )
    return content
  } catch (error) {
    const fell = fellOf(error)
    delegation.fell = fell
    note(`${worker.model} ${fell}, ${next(worker)}`)
    return undefined
  } finally {
    delegation.externalMs = Math.round(performance.now() - started)
  }
}
