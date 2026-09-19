# ccsaver

The [README](README.md) is the specification: a behaviour change edits it in the same commit.

Before writing or reviewing code, read [CONTRIBUTING.md](CONTRIBUTING.md): every rule, with its guard and an example from this code.

Gate, all green before a change is done: `pnpm test && pnpm typecheck && pnpm lint && claude plugin validate .`

House laws:

- `src/` imports `node:` built-ins and its own files: zero runtime dependencies.
- Names carry the meaning: code has no comments.
- Every function is an arrow const with an explicit return type; `unknown` is narrowed by a guard that checks at run time, and `as const` is the only `as`.
- Every file stays under this project's own gate, 350 lines and 32 KB: split by responsibility first.
- A development dependency, or a rule or override in `biome.json`, waits for the owner's approval.
- Commits: `type: subject` in English, a bullet-list body.
