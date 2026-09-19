import { basename, relative } from "node:path"
import { isUnder } from "./state.ts"

const SECRET_NAME =
  /^\.env(?!\.(example|sample|template)$)|^\.dev\.vars$|^\.credentials\.json$|^\.claude\.json$|^settings\.local\.json$|^api-key$|^\.npmrc$|^\.netrc$|^\.pypirc$|^\.pgpass$|^\.htpasswd$|^\.git-credentials$|^kubeconfig|^credentials(\.|$)|^\.?secrets?(\.|$)|^id_(rsa|ed25519|ecdsa|dsa)|\.(key|pem|p12|pfx|jks|keystore|ppk|kdbx|tfvars|tfstate)$|\.tfvars\.json$|\.tfstate\.backup$/i
const SECRET_PLACE =
  /(^|\/)(\.?secrets?|\.ssh|\.aws|\.gnupg|\.kube|\.git)(\/|$)|(^|\/)\.docker\/config\.json$/i
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----/
const TOKEN =
  /\b(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36}|xox[abprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35})\b/
const PROTECTED_PLACE =
  /(^|\/)(\.git|\.config\/git|\.vscode|\.idea|\.husky|\.cargo|\.devcontainer|\.yarn|\.mvn|\.claude)(\/|$)/i
const PROTECTED_NAME =
  /^(\.gitconfig|\.gitmodules|\.bash(rc|_profile|_login|_aliases|_logout)|\.z(shrc|profile|shenv|login|logout)|\.profile|\.envrc|\.npmrc|\.yarnrc(\.yml)?|\.pnp\.(cjs|loader\.mjs)|\.pnpmfile\.cjs|\.?bunfig\.toml|\.bazel(rc|version|iskrc)|\.pre-commit-config\.yaml|\.?lefthook\.ya?ml|(gradle|maven)-wrapper\.properties|\.devcontainer\.json|\.ripgreprc|pyrightconfig\.json|\.mcp\.json|\.claude\.json)$/i

export const pathRefusal = (
  given: string,
  path: string,
  root: string,
  home: string,
): string | undefined => {
  if (isUnder(path, home)) return "refusing to send a file from the ccsaver state folder"
  const names = [given, path]
  const places = names.map((name) => (isUnder(name, root) ? relative(root, name) : name))
  return names.some((name) => SECRET_NAME.test(basename(name))) ||
    places.some((place) => SECRET_PLACE.test(place))
    ? "refusing to send a secrets file to a worker"
    : undefined
}

export const contentRefusal = (text: string): string | undefined => {
  if (text.includes("\0")) return "refusing to send a binary file"
  if (PRIVATE_KEY.test(text)) return "refusing to send a file that holds a private key"
  return TOKEN.test(text) ? "refusing to send a file that holds an access token" : undefined
}

export const targetRefusal = (target: string, root: string): string | undefined => {
  if (!isUnder(target, root)) return "refusing to write outside the plugged project"
  return PROTECTED_PLACE.test(relative(root, target)) || PROTECTED_NAME.test(basename(target))
    ? "refusing to write a path that Claude Code protects"
    : undefined
}
