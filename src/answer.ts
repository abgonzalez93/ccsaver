export interface Cited {
  label: string
  lines: string[]
}

export interface Tally {
  match: number
  renumbered: number
  unverified: number
  bare: number
}

const FENCED = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/
const WRAPPED = /^\s*<file[^>]*>\s*\n([\s\S]*?)\n?<\/file>\s*$/
const INNER_FENCE = /^```/m
const RISKY =
  /\bchild_process\b|\bprocess\.env\b|\bsubprocess\b|\bos\.system\b|\b(?:eval|fetch|Function)\(|\brm -rf\b|\b(?:curl|wget) /g

const isSame = (line: string, text: string): boolean =>
  line === text || (text.length >= 20 && line.startsWith(text))

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const placeOf = (places: number[], claimed: number): number | undefined => {
  if (places.includes(claimed)) return claimed
  return places.length === 1 ? places[0] : undefined
}

const verdictOf = (line: number | undefined, claimed: number): keyof Tally => {
  if (line === undefined) return "unverified"
  return line === claimed ? "match" : "renumbered"
}

export const checked = (answer: string, sent: Cited[]): { text: string; tally: Tally } => {
  const labels = sent.map(({ label }) => escaped(label)).join("|")
  const cited = new RegExp(`^(.*? @ |.*)(?<![\\w./-])(${labels}):(\\d+):(.*)$`)
  const trimmed = new Map(sent.map(({ label, lines }) => [label, lines.map((line) => line.trim())]))
  const tally: Tally = { match: 0, renumbered: 0, unverified: 0, bare: 0 }
  const rows = answer.split("\n").map((row) => {
    const [, before = "", label = "", number = "", quote = ""] = cited.exec(row) ?? []
    if (label === "") {
      if (row.trim() !== "") tally.bare += 1
      return row
    }
    const claimed = Number(number)
    const text = quote
      .trim()
      .replace(/^`(.*)`$/, "$1")
      .trim()
    const places = (trimmed.get(label) ?? []).flatMap((line, i) =>
      text !== "" && isSame(line, text) ? [i + 1] : [],
    )
    const line = placeOf(places, claimed)
    tally[verdictOf(line, claimed)] += 1
    const kept = before.replace(/^[\s*+-]+/, "") === "" ? `:${quote}` : ""
    return `${before}${label}:${line ?? number}${kept}${line === undefined ? " [unverified]" : ""}`
  })
  return { text: rows.join("\n"), tally }
}

const peeled = (code: string): string => {
  const inner = FENCED.exec(code)?.[1]
  return (inner === undefined || INNER_FENCE.test(inner) ? code : inner).replace(WRAPPED, "$1")
}

export const unwrapped = (code: string): string => `${peeled(peeled(code)).trim()}\n`

export const risky = (code: string): string[] => [
  ...new Set([...code.matchAll(RISKY)].map(([found]) => found.replace(/[( ]$/, ""))),
]
