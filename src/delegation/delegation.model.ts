import type { Tally } from "../boundary/answer.validator.ts"

export const CHARS_PER_TOKEN = 4

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
  cut?: boolean
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

export const tokensOf = (message: string): number => Math.round(message.length / CHARS_PER_TOKEN)
