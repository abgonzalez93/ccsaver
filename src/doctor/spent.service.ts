import { foldMonth, monthKey, numberAt, type Row } from "../state/log.store.ts"
import { messageOf } from "../state/state.store.ts"
import type { Finding } from "./finding.model.ts"

const NEVER_DENIED = ["range", "outside", "unreadable", "malformed", "binary"]

interface Month {
  rows: number
  judged: number
  denied: number
  lengths: number[]
  calls: number
  paid: number
  usd: number
  byFell: Record<string, number>
}

const emptyMonth = (): Month => ({
  rows: 0,
  judged: 0,
  denied: 0,
  lengths: [],
  calls: 0,
  paid: 0,
  usd: 0,
  byFell: {},
})

const gateInto = (month: Month, row: Row): Month => {
  if (row["tool_use_id"] === "doctor" || NEVER_DENIED.includes(String(row["reason"]))) return month
  const denied = row["decision"] === "deny"
  const lines = row["lines"]
  if (denied && typeof lines === "number") month.lengths.push(lines)
  return { ...month, judged: month.judged + 1, denied: month.denied + (denied ? 1 : 0) }
}

const delegateInto = (month: Month, row: Row): Month => {
  const paid = row["answered"] === "fallback"
  const fell = String(row["fell"])
  return {
    ...month,
    calls: month.calls + 1,
    paid: month.paid + (paid ? 1 : 0),
    usd: month.usd + (paid ? numberAt(row, "cost") : 0),
    byFell: paid ? { ...month.byFell, [fell]: (month.byFell[fell] ?? 0) + 1 } : month.byFell,
  }
}

const into = (month: Month, row: Row): Month => {
  const counted = { ...month, rows: month.rows + 1 }
  if (row["kind"] === "gate") return gateInto(counted, row)
  return row["kind"] === "delegate" ? delegateInto(counted, row) : counted
}

const middleOf = (sorted: number[]): number | undefined => {
  const half = sorted.length / 2
  const above = sorted[Math.floor(half)]
  const below = sorted[Math.ceil(half) - 1]
  return above === undefined || below === undefined ? undefined : Math.round((below + above) / 2)
}

const deniedLine = ({ judged, denied, lengths }: Month): Finding[] => {
  if (judged === 0) return []
  const middle = middleOf(lengths.sort((first, second) => first - second))
  const median = middle === undefined ? "" : `, median ${middle} lines`
  const share = Math.round((100 * denied) / judged)
  return [
    {
      level: "ok",
      text: `denied: ${denied} of ${judged} whole-file reads this month (${share} %)${median}`,
    },
  ]
}

const spentLine = ({ rows, calls, paid, usd, byFell }: Month): Finding[] => {
  if (rows === 0) return []
  const why = Object.entries(byFell)
    .map(([fell, count]) => `${count} ${fell}`)
    .join(", ")
  return [
    {
      level: "ok",
      text: `spent: ${paid} of ${calls} delegations this month went to paid Claude Haiku ($${usd.toFixed(4)})${paid > 0 ? `: ${why}` : ""}`,
    },
  ]
}

export const monthFindings = (): Finding[] => {
  try {
    const month = foldMonth(monthKey(), emptyMonth(), into)
    return [...deniedLine(month), ...spentLine(month)]
  } catch (error) {
    return [{ level: "FAIL", text: `log: ${messageOf(error)}` }]
  }
}
