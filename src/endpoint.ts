import { existsSync, readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { record } from "./log.ts"
import {
  attempt,
  isEncrypted,
  isRecord,
  parsed,
  Refusal,
  readKey,
  workerFile,
  writePrivate,
} from "./state.ts"

export interface Worker {
  url: string
  model: string
  claude?: string
  fallback?: boolean
}

export const readWorker = (): Worker | undefined => {
  const text = attempt(() => readFileSync(workerFile(), "utf8"))
  if (text === undefined) {
    if (!existsSync(workerFile())) return undefined
    throw new Refusal(
      `${workerFile()} cannot be read: check its owner and its mode, nothing was sent`,
    )
  }
  const raw = parsed(text)
  const { url, model, claude, fallback } = isRecord(raw) ? raw : {}
  if (
    typeof url !== "string" ||
    typeof model !== "string" ||
    (claude !== undefined && typeof claude !== "string") ||
    (fallback !== undefined && typeof fallback !== "boolean")
  )
    throw new Refusal(`${workerFile()} is malformed: fix it or delete it, nothing was sent`)
  return {
    url,
    model,
    ...(claude ? { claude } : {}),
    ...(fallback === undefined ? {} : { fallback }),
  }
}

const storeWorker = (worker: Worker): void => {
  writePrivate(workerFile(), `${JSON.stringify(worker, null, 2)}\n`)
}

export const writeWorker = (url: string, model: string): string | undefined => {
  if (!isEncrypted(url))
    throw new Refusal(
      `the worker url must be https (localhost excepted), this one is ${attempt(() => new URL(url).protocol) ?? "not a url"}`,
    )
  if (model.length === 0) throw new Refusal("the worker model is required")
  const parts = new URL(url)
  if (parts.username !== "" || parts.password !== "")
    throw new Refusal(
      "the worker url must carry no user name or password: fetch refuses one, and the key belongs in ccsaver key set",
    )
  const before = readWorker()
  const host = parts.host
  storeWorker({ ...before, url, model })
  record("config", { action: "worker set", host, model })
  if (before === undefined || readKey() === undefined) return undefined
  const old = attempt(() => new URL(before.url).host)
  return old === host
    ? undefined
    : `the worker moved from ${old ?? "another host"} to ${host} and the stored key stays: run ccsaver key set unless the key belongs to ${host}`
}

export const setFallback = (on: boolean): void => {
  const worker = readWorker()
  if (worker === undefined)
    throw new Refusal(
      "the fallback is the only worker until you set one, run: ccsaver worker set <url> <model>",
    )
  storeWorker({ ...worker, fallback: on })
  record("config", { action: "fallback", on })
}

export const setClaude = (path: string | undefined): string | undefined => {
  const worker = readWorker()
  if (worker === undefined)
    throw new Refusal("worker.json is not there yet, run: ccsaver worker set <url> <model>")
  const claude = path === undefined ? undefined : resolve(path)
  if (claude !== undefined && attempt(() => statSync(claude).isFile()) !== true)
    throw new Refusal(`not a file: ${path}`)
  storeWorker({
    url: worker.url,
    model: worker.model,
    ...(claude === undefined ? {} : { claude }),
    ...(worker.fallback === undefined ? {} : { fallback: worker.fallback }),
  })
  record("config", { action: "worker claude", pinned: claude !== undefined })
  return claude
}
