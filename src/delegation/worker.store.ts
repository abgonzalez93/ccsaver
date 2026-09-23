import { existsSync, readFileSync, renameSync, statSync } from "node:fs"
import { resolve } from "node:path"
import { record } from "../state/log.store.ts"
import {
  attempt,
  isEncrypted,
  isRecord,
  keyFile,
  movedKeyFile,
  parsed,
  Refusal,
  readKey,
  workerFile,
  writePrivate,
} from "../state/state.store.ts"

export interface Worker {
  url: string
  model: string
  claude?: string
  fallback?: boolean
}

const WORKER_KEYS = ["url", "model", "claude", "fallback"]

const malformed = (): string =>
  `${workerFile()} is malformed: fix it or delete it, nothing was sent`

export const readWorker = (): Worker | undefined => {
  const text = attempt(() => readFileSync(workerFile(), "utf8"))
  if (text === undefined) {
    if (!existsSync(workerFile())) return undefined
    throw new Refusal(
      `${workerFile()} cannot be read: check its owner and its mode, nothing was sent`,
    )
  }
  const raw = parsed(text)
  if (!isRecord(raw) || !Object.keys(raw).every((key) => WORKER_KEYS.includes(key)))
    throw new Refusal(malformed())
  const { url, model, claude, fallback } = raw
  if (
    typeof url !== "string" ||
    typeof model !== "string" ||
    (claude !== undefined && typeof claude !== "string") ||
    (fallback !== undefined && typeof fallback !== "boolean")
  )
    throw new Refusal(malformed())
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

export interface WorkerSet {
  changed: boolean
  advice?: string
}

export const writeWorker = (url: string, model: string): WorkerSet => {
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
  if (before?.url === url && before.model === model) return { changed: false }
  const host = parts.host
  storeWorker({ ...before, url, model })
  record("config", { action: "worker set", host, model })
  if (before === undefined || readKey() === undefined) return { changed: true }
  const old = attempt(() => new URL(before.url).host)
  if (old === host) return { changed: true }
  attempt(() => renameSync(keyFile(), movedKeyFile()))
  return {
    changed: true,
    advice: `the worker moved from ${old ?? "another host"} to ${host} and the stored key was set aside in ${movedKeyFile()}: run ccsaver key set with the key of ${host}`,
  }
}

export const setFallback = (on: boolean): boolean => {
  const worker = readWorker()
  if (worker === undefined)
    throw new Refusal(
      "the fallback is the only worker until you set one, run: ccsaver worker set <url> <model>",
    )
  if ((worker.fallback ?? true) === on) return false
  storeWorker({ ...worker, fallback: on })
  record("config", { action: "fallback", on })
  return true
}

export interface Pin {
  pinned: string | undefined
  was: string | undefined
}

export const setClaude = (path: string | undefined): Pin => {
  const worker = readWorker()
  if (worker === undefined)
    throw new Refusal("worker.json is not there yet, run: ccsaver worker set <url> <model>")
  const claude = path === undefined ? undefined : resolve(path)
  if (claude !== undefined && attempt(() => statSync(claude).isFile()) !== true)
    throw new Refusal(`not a file: ${path}`)
  const was = worker.claude
  if (claude === was) return { pinned: claude, was }
  storeWorker({
    url: worker.url,
    model: worker.model,
    ...(claude === undefined ? {} : { claude }),
    ...(worker.fallback === undefined ? {} : { fallback: worker.fallback }),
  })
  record("config", { action: "worker claude", pinned: claude !== undefined })
  return { pinned: claude, was }
}
