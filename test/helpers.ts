import { execFile } from "node:child_process"
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"

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
}

export interface FakeServer {
  url: string
  seen: Seen[]
  reply: Reply
  reset: () => void
  close: () => void
}

export const tempDir = (label: string): string =>
  realpathSync(mkdtempSync(join(tmpdir(), `ccsaver-${label}-`)))

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
    )
  if (state.worker !== undefined)
    writeFileSync(join(home, "worker.json"), JSON.stringify(state.worker))
  if (state.key !== undefined)
    writeFileSync(join(home, "api-key"), `${state.key}\n`, { mode: 0o600 })
}

export const startServer = async (): Promise<FakeServer> => {
  const seen: Seen[] = []
  const reply: Reply = { status: 200, content: "FROM-EXTERNAL", finish: "stop", accepts: undefined }
  const server = createServer((request, response) => {
    let body = ""
    request.on("data", (chunk) => {
      body += chunk
    })
    request.on("end", () => {
      const authorization = request.headers.authorization
      seen.push({ authorization, body })
      const refused = reply.accepts !== undefined && authorization !== `Bearer ${reply.accepts}`
      response.writeHead(refused ? 401 : reply.status, { "content-type": "application/json" })
      response.end(
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
    },
    close: (): void => {
      server.close()
    },
  }
}
