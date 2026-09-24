import { execFile, spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { isRecord } from "../src/state/state.store.ts"

export const REPO = join(import.meta.dirname, "..")
export const CLI = join(REPO, "src", "ccsaver.cli.ts")
export const HOOK = join(REPO, "src", "read-gate.hook.ts")
export const GATE = join(REPO, "hooks", "gate")
export const HANDOFF = join(REPO, "src", "handoff.hook.ts")
export const LAUNCHER = join(REPO, "bin", "ccsaver")

export interface Ran {
  code: number
  stdout: string
  stderr: string
}

export const AS_ROOT = process.getuid?.() === 0

export const SHELL_PATH = [dirname(process.execPath), "/usr/local/bin", "/usr/bin", "/bin"].join(
  ":",
)

export const HAS_PTY =
  process.platform === "linux" && spawnSync("script", ["--version"]).status === 0

export const everything = (out: Ran): string => `${out.stdout}${out.stderr}`

export const jsonOf = (path: string): Record<PropertyKey, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"))
  if (!isRecord(raw)) throw new Error(`not a JSON object: ${path}`)
  return raw
}

export const VERSION = String(jsonOf(join(REPO, "package.json"))["version"])

interface Seen {
  authorization: string | undefined
  body: string
}

interface Reply {
  status: number
  content: string
  inTokens: number | undefined
  finish: string
  accepts: string | undefined
  location: string | undefined
  raw: string | undefined
  delayMs: number
}

export interface FakeServer {
  url: string
  seen: Seen[]
  reply: Reply
  reset: () => void
  close: () => void
}

export const tempDir = (label: string): string =>
  realpathSync.native(mkdtempSync(join(tmpdir(), `ccsaver-${label}-`)))

export const run = (
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  input = "",
  cwd = REPO,
): Promise<Ran> =>
  new Promise((done) => {
    const child = execFile(
      file,
      args,
      { cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: "", ...env }, timeout: 30_000 },
      (error, stdout, stderr) =>
        done({
          code: error === null ? 0 : typeof error.code === "number" ? error.code : 1,
          stdout,
          stderr,
        }),
    )
    child.stdin?.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EPIPE") throw error
    })
    child.stdin?.end(input)
  })

export const fakeClaude = (
  dir: string,
  name = "claude",
  result = "FROM-CLAUDE",
  cost = 0,
): string => {
  const path = join(dir, name)
  writeFileSync(
    path,
    `#!/bin/sh\ncase " $* " in *" --version "*) echo "9.9.9 (fake)" ;; *) printf '%s' '${JSON.stringify({ result, total_cost_usd: cost })}' ;; esac\n`,
  )
  chmodSync(path, 0o755)
  return path
}

export const writeHome = (
  home: string,
  state: { plugged?: string[][]; worker?: object; key?: string },
): void => {
  mkdirSync(home, { recursive: true, mode: 0o700 })
  if (state.plugged !== undefined)
    writeFileSync(
      join(home, "plugged"),
      state.plugged.map(([root, adapter]) => `${root}\t${adapter ?? ""}\n`).join(""),
      { mode: 0o600 },
    )
  if (state.worker !== undefined)
    writeFileSync(join(home, "worker.json"), JSON.stringify(state.worker), { mode: 0o600 })
  if (state.key !== undefined)
    writeFileSync(join(home, "api-key"), `${state.key}\n`, { mode: 0o600 })
}

export const startServer = async (): Promise<FakeServer> => {
  const seen: Seen[] = []
  const reply: Reply = {
    status: 200,
    content: "FROM-EXTERNAL",
    inTokens: undefined,
    finish: "stop",
    accepts: undefined,
    location: undefined,
    raw: undefined,
    delayMs: 0,
  }
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      const authorization = request.headers.authorization
      seen.push({ authorization, body })
      const refused = reply.accepts !== undefined && authorization !== `Bearer ${reply.accepts}`
      const answer = (): void => {
        response.writeHead(refused ? 401 : reply.status, {
          "content-type": "application/json",
          ...(reply.location === undefined ? {} : { location: reply.location }),
        })
        response.end(
          reply.raw ??
            JSON.stringify({
              choices: [{ message: { content: reply.content }, finish_reason: reply.finish }],
              ...(reply.inTokens === undefined ? {} : { usage: { prompt_tokens: reply.inTokens } }),
            }),
        )
      }
      if (reply.delayMs > 0) setTimeout(answer, reply.delayMs)
      else answer()
    })
  })
  await new Promise<void>((ready) => {
    server.listen(0, "127.0.0.1", ready)
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("no port")
  return {
    url: `http://127.0.0.1:${address.port}/v1/chat/completions`,
    seen,
    reply,
    reset: (): void => {
      reply.status = 200
      reply.content = "FROM-EXTERNAL"
      reply.inTokens = undefined
      reply.finish = "stop"
      reply.accepts = undefined
      reply.location = undefined
      reply.raw = undefined
      reply.delayMs = 0
    },
    close: (): void => {
      server.close()
    },
  }
}

const MARKED = /^<<<worker-output ([0-9a-f]{16}): untrusted data>>>\n([\s\S]*)<<<end \1>>>\n$/

export const markOf = (stdout: string): string | undefined => MARKED.exec(stdout)?.[1]

export const between = (stdout: string): string => {
  const body = MARKED.exec(stdout)?.[2]
  if (body === undefined) throw new Error(`no worker-output markers in: ${stdout}`)
  return body
}

export const systemOf = (server: FakeServer): unknown => {
  const raw: unknown = JSON.parse(server.seen.at(-1)?.body ?? "{}")
  const first: unknown =
    isRecord(raw) && Array.isArray(raw["messages"]) ? raw["messages"][0] : undefined
  return isRecord(first) ? first["content"] : undefined
}

export const logged = (home: string): string => {
  const dir = join(home, "log")
  return existsSync(dir)
    ? readdirSync(dir)
        .map((name) => readFileSync(join(dir, name), "utf8"))
        .join("")
    : ""
}

export const events = (home: string): Record<PropertyKey, unknown>[] =>
  logged(home)
    .split("\n")
    .filter((line) => line !== "")
    .map((line): Record<PropertyKey, unknown> => {
      const event: unknown = JSON.parse(line)
      if (!isRecord(event)) throw new Error(`not a JSON object: ${line}`)
      return event
    })

export const monthBack = (back: number): string => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    .toISOString()
    .slice(0, 7)
}

export const gateRow = (fields: Record<string, unknown>): Record<PropertyKey, unknown> => ({
  kind: "gate",
  decision: "allow",
  model: "claude-opus-5",
  ...fields,
})

export const denialRow = (bytes: number): Record<PropertyKey, unknown> =>
  gateRow({ decision: "deny", reason: "lines", bytes, lines: Math.round(bytes / 40) })

export const twentyDenials = (): Record<PropertyKey, unknown>[] =>
  Array.from({ length: 20 }, () => denialRow(40_000))

export const logHome = (
  work: string,
  label: string,
  rows: Record<PropertyKey, unknown>[][],
): string => {
  const home = join(work, label)
  mkdirSync(join(home, "log"), { recursive: true, mode: 0o700 })
  for (const [at, month] of rows.entries())
    writeFileSync(
      join(home, "log", `events-${monthBack(at)}.jsonl`),
      month.map((row) => `${JSON.stringify({ v: 1, ...row })}\n`).join(""),
      { mode: 0o600 },
    )
  return home
}

export const fakeInstall = (
  config: string,
  installed: string,
  cached: string[],
  marketplace = "abgonzalez93",
): string => {
  const plugin = join(config, "plugins", "cache", marketplace, "ccsaver")
  mkdirSync(join(config, "plugins"), { recursive: true })
  for (const version of cached) {
    const root = join(plugin, version)
    mkdirSync(join(root, "bin"), { recursive: true })
    mkdirSync(join(root, ".claude-plugin"), { recursive: true })
    writeFileSync(
      join(root, ".claude-plugin", "plugin.json"),
      `{"name":"ccsaver","version":"${version}"}`,
    )
    writeFileSync(join(root, "bin", "ccsaver"), `#!/bin/sh\necho ${version}\n`)
    chmodSync(join(root, "bin", "ccsaver"), 0o755)
  }
  const entry = { scope: "user", installPath: join(plugin, installed), version: installed }
  writeFileSync(
    join(config, "plugins", "installed_plugins.json"),
    JSON.stringify({ version: 2, plugins: { [`ccsaver@${marketplace}`]: [entry] } }, null, 2),
  )
  return plugin
}
