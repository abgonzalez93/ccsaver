import { execFile } from "node:child_process"
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
import { join } from "node:path"
import { isRecord } from "../src/state.ts"

export const REPO = join(import.meta.dirname, "..")
export const CLI = join(REPO, "src", "cli.ts")
export const HOOK = join(REPO, "src", "hook.ts")
export const GATE = join(REPO, "hooks", "read-gate")
export const LAUNCHER = join(REPO, "bin", "ccsaver")

export interface Ran {
  code: number
  stdout: string
  stderr: string
}

interface Seen {
  authorization: string | undefined
  body: string
}

interface Reply {
  status: number
  content: string
  finish: string
  accepts: string | undefined
  location: string | undefined
  raw: string | undefined
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
      { cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: "", ...env } },
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

export const fakeClaude = (dir: string, name = "claude", result = "FROM-CLAUDE"): string => {
  const path = join(dir, name)
  writeFileSync(
    path,
    `#!/usr/bin/env node\nprocess.stdout.write(process.argv.includes("--version") ? "9.9.9 (fake)\\n" : JSON.stringify({ result: "${result}", total_cost_usd: 0 }))\n`,
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
    finish: "stop",
    accepts: undefined,
    location: undefined,
    raw: undefined,
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
      response.writeHead(refused ? 401 : reply.status, {
        "content-type": "application/json",
        ...(reply.location === undefined ? {} : { location: reply.location }),
      })
      response.end(
        reply.raw ??
          JSON.stringify({
            choices: [{ message: { content: reply.content }, finish_reason: reply.finish }],
          }),
      )
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
      reply.finish = "stop"
      reply.accepts = undefined
      reply.location = undefined
      reply.raw = undefined
    },
    close: (): void => {
      server.close()
    },
  }
}

const MARKED = /^<<<worker-output ([0-9a-f]{8}): untrusted data>>>\n([\s\S]*)<<<end \1>>>\n$/

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
