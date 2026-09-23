import { readFileSync, writeSync } from "node:fs"

const registry = process.argv.at(-1)
const install =
  "claude plugin install ccsaver@abgonzalez93, or remove this launcher: rm -f ~/.local/bin/ccsaver"

const isRecord = (value) => typeof value === "object" && value !== null

const stop = (text) => {
  writeSync(2, `Error: ${text}\n`)
  process.exit(1)
}

const read = () => {
  try {
    return readFileSync(registry, "utf8")
  } catch {
    return stop(`ccsaver is not installed (no ${registry}): ${install}`)
  }
}

const parse = (text) => {
  try {
    return JSON.parse(text)
  } catch {
    return stop(`${registry} is not JSON, so this launcher cannot tell which ccsaver is installed`)
  }
}

const raw = parse(read())
if (!isRecord(raw) || raw.version !== 2 || !isRecord(raw.plugins))
  stop(
    `${registry} has a shape this launcher does not know: run ccsaver from a Claude Code session, and update ccsaver`,
  )
const installs = Object.entries(raw.plugins)
  .filter(([id]) => id.startsWith("ccsaver@"))
  .flatMap(([, list]) => (Array.isArray(list) ? list : []))
if (installs.length === 0) stop(`ccsaver is not installed: ${install}`)
const chosen = installs.find((entry) => isRecord(entry) && entry.scope === "user") ?? installs[0]
if (!isRecord(chosen) || typeof chosen.installPath !== "string")
  stop(`${registry}: the ccsaver entry has no installPath this launcher knows`)
writeSync(1, chosen.installPath)
