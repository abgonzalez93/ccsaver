import { existsSync, readFileSync } from "node:fs"
import { record } from "./log.ts"
import { attempt, isRecord, parsed, pricesFile, Refusal, writePrivate } from "./state.ts"

export const MODEL_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/

export const WORKER = "worker"

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
  const { models, worker, main } = isRecord(raw) ? raw : {}
  if (main !== undefined)
    throw new Refusal(
      `${pricesFile()} carries one main price for every model, which a month that changed model reads wrong: delete it and set one price per model, ccsaver price <model> <usd>`,
    )
  if (worker !== undefined && !isRate(worker))
    throw new Refusal(`${pricesFile()} is malformed: the worker price must be 0 or above`)
  return { models: modelPrices(models), ...(isRate(worker) ? { worker } : {}) }
}

export const writePrice = (which: string, usd: number): Prices => {
  const before = readPrices()
  const after: Prices =
    which === WORKER
      ? { ...before, worker: usd }
      : { ...before, models: { ...before.models, [which]: usd } }
  writePrivate(pricesFile(), `${JSON.stringify(after, null, 2)}\n`)
  record("config", { action: "price", which, usd })
  return after
}

const RATE = 28

export const listedPrices = ({ models, worker }: Prices): string => {
  const free = worker === undefined ? "unset" : worker === 0 ? "free" : `$${worker}/M`
  const rows: [string, string][] = Object.entries(models).map(([model, each]) => [
    model,
    `$${each}/M`,
  ])
  const lines = [...rows, [WORKER, free]]
    .map(([name = "", rate = ""]) => `  ${name.padEnd(RATE)}${rate}`)
    .join("\n")
  return rows.length === 0
    ? `no model has a price yet: ccsaver price <model> <usd per million>\n${lines}\n`
    : `${lines}\n`
}

export const shownPrices = ({ models, worker }: Prices): string =>
  [
    ...Object.entries(models).map(([model, each]) => `${model} $${each}/M`),
    `worker ${worker === undefined ? "unset" : worker === 0 ? "free" : `$${worker}/M`}`,
  ].join(" · ")
