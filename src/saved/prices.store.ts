import { existsSync, readFileSync } from "node:fs"
import { record } from "../state/log.store.ts"
import {
  attempt,
  isRecord,
  parsed,
  pricesFile,
  Refusal,
  scrubbed,
  workerFile,
  writePrivate,
} from "../state/state.store.ts"

export const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/

export const WORKER = "worker"

const PRICE_KEYS = ["models", "worker", "main"]

export interface Prices {
  models: Record<string, number>
  worker?: number
}

const isPrice = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0

const isRate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

const modelPrices = (raw: unknown): Record<string, number> => {
  if (raw === undefined) return {}
  if (!isRecord(raw) || Array.isArray(raw))
    throw new Refusal(`${pricesFile()} is malformed: models holds one price per model name`)
  const priced = Object.entries(raw).flatMap(([name, value]): [string, number][] =>
    MODEL_NAME.test(name) && isPrice(value) ? [[name, value]] : [],
  )
  if (priced.length !== Object.keys(raw).length)
    throw new Refusal(`${pricesFile()} is malformed: every model needs a name and a price above 0`)
  return Object.fromEntries(priced)
}

export const readPrices = (): Prices => {
  const text = attempt(() => readFileSync(pricesFile(), "utf8"))
  if (text === undefined) {
    if (!existsSync(pricesFile())) return { models: {} }
    throw new Refusal(`${pricesFile()} cannot be read: check its owner and its mode`)
  }
  const raw = parsed(text)
  if (
    !isRecord(raw) ||
    Array.isArray(raw) ||
    !Object.keys(raw).every((key) => PRICE_KEYS.includes(key))
  )
    throw new Refusal(
      `${pricesFile()} is malformed: it holds one object, with models and worker inside it`,
    )
  const { models, worker, main } = raw
  if (main !== undefined)
    throw new Refusal(
      `${pricesFile()} carries one main price for every model, which a month that changed model reads wrong: delete it and set one price per model, ccsaver price <model> <usd>`,
    )
  if (worker !== undefined && !isRate(worker))
    throw new Refusal(`${pricesFile()} is malformed: the worker price must be 0 or above`)
  return { models: modelPrices(models), ...(isRate(worker) ? { worker } : {}) }
}

export interface Priced {
  prices: Prices
  was: number | undefined
}

export const writePrice = (which: string, usd: number): Priced => {
  const before = readPrices()
  const was = which === WORKER ? before.worker : before.models[which]
  if (was === usd) return { prices: before, was }
  const after: Prices =
    which === WORKER
      ? { ...before, worker: usd }
      : { ...before, models: { ...before.models, [which]: usd } }
  writePrivate(pricesFile(), `${JSON.stringify(after, null, 2)}\n`)
  record("config", { action: "price", which, usd })
  return { prices: after, was }
}

export const workerNamed = (): string => {
  const raw = parsed(attempt(() => readFileSync(workerFile(), "utf8")) ?? "")
  const model = isRecord(raw) ? raw["model"] : undefined
  return typeof model === "string" && model !== "" ? `${WORKER} (${scrubbed(model)})` : WORKER
}

const GAP = 3

const rateOf = (worker: number | undefined): string =>
  worker === undefined ? "unset" : worker === 0 ? "free" : `$${worker}/M`

export const listedPrices = ({ models, worker }: Prices): string => {
  const rows: [string, string][] = Object.entries(models).map(([model, each]) => [
    model,
    `$${each}/M`,
  ])
  const all: [string, string][] = [...rows, [workerNamed(), rateOf(worker)]]
  const width = Math.max(...all.map(([name]) => name.length)) + GAP
  const lines = all.map(([name, rate]) => `  ${name.padEnd(width)}${rate}`).join("\n")
  return rows.length === 0
    ? `no model has a price yet: ccsaver price <model> <usd per million>\n${lines}\n`
    : `${lines}\n`
}

export const shownPrices = ({ models, worker }: Prices): string =>
  [
    ...Object.entries(models).map(([model, each]) => `${model} $${each}/M`),
    `${workerNamed()} ${rateOf(worker)}`,
  ].join(" · ")
