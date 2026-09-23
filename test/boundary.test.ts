import assert from "node:assert/strict"
import { test } from "node:test"
import { contentRefusal, pathRefusal, targetRefusal } from "../src/delegation/boundary.ts"

const ROOT = "/work/project"
const STATE = "/home/me/.config/ccsaver"

const kept = (given: string, real = given, root = ROOT): string | undefined =>
  pathRefusal(
    given.startsWith("/") ? given : `${root}/${given}`,
    real.startsWith("/") ? real : `${root}/${real}`,
    root,
    STATE,
  )

test("refuses secret-looking names in any letter case, by given name and by real name", () => {
  const names = [".env", ".env.local", ".netrc", "id_ecdsa", "release.jks", "api-key", ".pgpass"]
  const shouting = [".ENV", "ID_RSA", "Server.PEM"]
  const infra = ["prod.tfstate", "prod.tfvars", "terraform.tfvars.json", "kubeconfig.yaml"]
  const stores = [".pypirc", "key.ppk", ".htpasswd", "vault.kdbx", "credentials", "secrets.yaml"]
  for (const name of [...names, ...shouting, ...infra, ...stores])
    assert.match(kept(`config/${name}`) ?? "", /secrets file/, name)
  assert.match(kept("notes.txt", "/elsewhere/.env") ?? "", /secrets file/)
  assert.match(kept(".env.alias", "source.ts") ?? "", /secrets file/)
})

test("lets an env template and ordinary files through", () => {
  const plain = [".env.example", ".ENV.SAMPLE", ".env.template", "src/config.ts", "environment.ts"]
  for (const name of [...plain, "docs/secrets-management.md", ".docker/Dockerfile", "src/keys.ts"])
    assert.equal(kept(name), undefined, name)
  assert.match(kept(".env.example.local") ?? "", /secrets file/)
})

test("refuses the places that hold credentials, inside the root and outside it", () => {
  const inside = ["secrets/prod.yaml", "deploy/.secrets/db.yaml", ".kube/config", ".aws/config"]
  const cloned = [".git/config", "vendor/.git/config"]
  const outside = ["/home/me/.ssh/config", "/home/me/.gnupg/pubring.kbx", "/home/me/.kube/prod"]
  for (const place of [...inside, ...cloned, ".docker/config.json", "Secret/notes.md", ...outside])
    assert.match(kept(place) ?? "", /secrets file/, place)
  assert.match(kept("link.yaml", "secrets/prod.yaml") ?? "", /secrets file/)
  assert.equal(kept("src/a.ts", "src/a.ts", "/work/secrets/project"), undefined)
  for (const kind of [".github/workflows/ci.yml", ".gitignore", "src/.gitkeep"])
    assert.equal(kept(kind), undefined, kind)
})

test("refuses anything in the state folder before it looks at the name", () => {
  assert.match(kept(`${STATE}/log/events-2026-09.jsonl`) ?? "", /state folder/)
  assert.match(kept("innocent.txt", `${STATE}/worker.json`) ?? "", /state folder/)
})

test("refuses a private key, a well-known token and a binary, whatever the file is called", () => {
  const armor = `${["-----BEGIN", "OPENSSH PRIVATE KEY-----"].join(" ")}\nabc\n`
  const tokens = [
    ["AKIA", "IOSFODNN7EXAMPLE"].join(""),
    ["ghp", "0123456789abcdefghijklmnopqrstuvwxyz"].join("_"),
    ["xoxb", "1234567890-abcdefghij"].join("-"),
    ["sk", "proj-0123456789abcdefghij"].join("-"),
    ["AIza", "SyA-0123456789abcdefghijklmnopqrstu"].join(""),
    ["github", "pat", "11ABCDEFG0abcdefghijklmnopqrstuvwxyz"].join("_"),
    ["glpat", "ABCDEFGHIJ1234567890abcd"].join("-"),
    ["npm", "0123456789abcdefghijklmnopqrstuvwxyz"].join("_"),
    ["sk", "live_51H8xQ2eZvKYlo2Cabcdefghij"].join("_"),
    ["rk", "live_51H8xQ2eZvKYlo2Cabcdefghij"].join("_"),
  ]
  const block = `${["-----BEGIN", "PGP", "PRIVATE KEY BLOCK-----"].join(" ")}\nabc\n`
  for (const header of [armor, block]) assert.match(contentRefusal(header) ?? "", /private key/)
  for (const token of tokens)
    assert.match(contentRefusal(`const t = "${token}"\n`) ?? "", /access token/, token.slice(0, 6))
  assert.match(contentRefusal("x\n\0y") ?? "", /binary/)
  assert.equal(contentRefusal('export const task = "ask-the-worker"\nconst skip = 1\n'), undefined)
})

test("a target stays inside the root and away from what Claude Code protects", () => {
  const refused = ["/work/elsewhere/out.ts", "/work/project-two/out.ts"]
  const guarded = [".claude/settings.json", ".Git/hooks/pre-commit", ".envrc", "sub/.vscode/x.json"]
  for (const target of refused) assert.match(targetRefusal(target, ROOT) ?? "", /outside/)
  for (const target of guarded)
    assert.match(targetRefusal(`${ROOT}/${target}`, ROOT) ?? "", /protects/, target)
  assert.equal(targetRefusal(`${ROOT}/src/new.test.ts`, ROOT), undefined)
  assert.equal(targetRefusal(`${ROOT}/.github/workflows/ci.yml`, ROOT), undefined)
})
