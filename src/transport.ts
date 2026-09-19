// Portions of this file are adapted from a third-party Apache-2.0 work and were modified; see NOTICE.
import { spawnSync } from "node:child_process"
import { tmpdir } from "node:os"
import { isEncrypted, isRecord, parsed, readKey, record, type Worker } from "./state.ts"

const FALLBACK_MODEL = "haiku"
const NO_MCP_SERVERS = '{"mcpServers":{}}'
const BARE_SETTINGS = '{"disableAllHooks":true,"env":{"CLAUDE_CODE_EFFORT_LEVEL":"low"}}'
const FALLBACK_TIMEOUT_MS = 180_000
const EXTERNAL_TIMEOUT_MS = 30_000
const FALLBACK_MAX_CHARS = 400_000
const CHARS_PER_TOKEN = 4
const TEMPERATURE = 0.2

type Fell = "timeout" | "not json" | "unreachable"

export const CLAUDE_ON_PATH = "claude"

export const delegation: Record<string, unknown> = {}

export const fail: (message: string) => never = (message) => {
  record("fail", { text: message })
  process.stderr.write(`Error: ${message}\n`)
  process.exit(1)
}

export const note = (text: string): void => {
  record("note", { text })
  process.stderr.write(`[ccsaver: ${text}]\n`)
}

export const claudeBin = (worker: Worker | undefined): string =>
  worker?.claude ?? (process.env["CLAUDE_CODE_EXECPATH"] || CLAUDE_ON_PATH)

const tokensOf = (message: string): number => Math.round(message.length / CHARS_PER_TOKEN)

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
      env: { ...process.env, MAX_THINKING_TOKENS: "0", CLAUDE_CODE_EFFORT_LEVEL: "low" },
    },
  )
  delegation["fallbackMs"] = Math.round(performance.now() - started)
  const stoppedReading = isRecord(run.error) && run.error["code"] === "EPIPE"
  if (run.error && !stoppedReading)
    return fail(`fallback worker could not run: ${run.error.message}`)
  if (run.status !== 0)
    return fail(`fallback worker exited ${run.status ?? run.signal}: ${run.stderr.slice(0, 400)}`)
  const raw = parsed(run.stdout)
  if (!isRecord(raw) || typeof raw["result"] !== "string")
    return fail(`fallback worker returned no result: ${run.stdout.slice(0, 200)}`)
  if (raw["is_error"] === true)
    return fail(`fallback worker failed: ${raw["result"].slice(0, 400)}`)
  const cost = typeof raw["total_cost_usd"] === "number" ? raw["total_cost_usd"] : null
  Object.assign(delegation, {
    answered: "fallback",
    model: FALLBACK_MODEL,
    answerChars: raw["result"].length,
    cost,
  })
  note(
    `~${tokensOf(message)} input tokens by chars/4 | $${cost?.toFixed(4) ?? "?"} | ${FALLBACK_MODEL} | delegated to ${mode}`,
  )
  return raw["result"]
}

export const requestOf = (
  model: string,
  system: string,
  message: string,
): Record<string, unknown> => ({
  model,
  temperature: TEMPERATURE,
  messages: [
    { role: "system", content: system },
    { role: "user", content: message },
  ],
})

export const fellOf = (error: unknown): Fell => {
  if (error instanceof Error && error.name === "TimeoutError") return "timeout"
  return error instanceof SyntaxError ? "not json" : "unreachable"
}

const contentOf = (raw: unknown): string | undefined => {
  if (!isRecord(raw) || !Array.isArray(raw["choices"])) return undefined
  const first: unknown = raw["choices"][0]
  if (!isRecord(first) || !isRecord(first["message"]) || first["finish_reason"] === "length")
    return undefined
  const content = first["message"]["content"]
  return typeof content === "string" && content.length > 0 ? content : undefined
}

export const invokeExternal = async (
  mode: string,
  system: string,
  message: string,
  worker: Worker | undefined,
): Promise<string | undefined> => {
  const key = readKey()
  if (worker === undefined || key === undefined) {
    delegation["fell"] = worker === undefined ? "no worker" : "no key"
    if (worker !== undefined) note("no API key is stored (ccsaver key set), falling back")
    return undefined
  }
  if (!isEncrypted(worker.url)) {
    delegation["fell"] = "not https"
    note("the worker url is not https, falling back")
    return undefined
  }
  const started = performance.now()
  try {
    const response = await fetch(worker.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS),
      redirect: "error",
      body: JSON.stringify(requestOf(worker.model, system, message)),
    })
    delegation["status"] = response.status
    const raw: unknown = response.ok ? await response.json() : undefined
    const content = contentOf(raw)
    if (content === undefined) {
      delegation["fell"] = response.ok ? "incomplete" : "status"
      note(`${worker.model} answered ${response.status} without a complete result, falling back`)
      return undefined
    }
    Object.assign(delegation, {
      answered: "external",
      model: worker.model,
      answerChars: content.length,
    })
    note(
      `~${tokensOf(message)} input tokens by chars/4 | external | ${worker.model} | delegated to ${mode}`,
    )
    return content
  } catch (error) {
    const fell = fellOf(error)
    delegation["fell"] = fell
    note(`${worker.model} ${fell}, falling back`)
    return undefined
  } finally {
    delegation["externalMs"] = Math.round(performance.now() - started)
  }
}
