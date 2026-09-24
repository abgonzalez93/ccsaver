import { attempt } from "../state/state.store.ts"

const UNSEEN = /[\p{Cc}​-‏‪-‮⁠-⁤⁦-⁩﻿]/gu

export type Tone = "ok" | "warn" | "fail" | "info"

const MARK = { ok: ["✓", 32], warn: ["!", 33], fail: ["✗", 31], info: ["→", 36] } as const

const onTerminal = (stream: NodeJS.WriteStream): boolean =>
  stream.isTTY === true && !process.env["NO_COLOR"] && process.env["TERM"] !== "dumb"

const escapedChar = (char: string): string => {
  const code = char.charCodeAt(0)
  return code < 0x100
    ? `\\x${code.toString(16).padStart(2, "0")}`
    : `\\u${code.toString(16).padStart(4, "0")}`
}

export const scrubbed = (text: string): string =>
  text.replace(UNSEEN, (char) => (char === "\n" || char === "\t" ? char : escapedChar(char)))

export const tinted = (
  text: string,
  colour: number,
  stream: NodeJS.WriteStream = process.stdout,
): string => (onTerminal(stream) ? `\u001b[${colour}m${text}\u001b[0m` : text)

export const marked = (
  tone: Tone,
  label: string,
  text: string,
  stream: NodeJS.WriteStream = process.stdout,
): string => {
  const [glyph, colour] = MARK[tone]
  if (onTerminal(stream))
    return `${tinted(label === "" ? glyph : `${glyph} ${label}`, colour, stream)} ${text}`
  return label === "" ? text : `${label} ${text}`
}

export const shown = (url: string): string => {
  const parts = attempt(() => new URL(url))
  return parts === undefined ? "(an unreadable url)" : `${parts.origin}${parts.pathname}`
}

export const quoted = (path: string): string =>
  /^[\w./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`
