# ccsaver

The [README](README.md) and the pages it links under [docs/](docs/) are the specification: a behaviour change edits the page that covers it, in the same commit.

| Page | What it specifies |
| --- | --- |
| [README.md](README.md) | what ccsaver is, the quickstart, the honest limits, what leaves your machine, the commands |
| [docs/configuration.md](docs/configuration.md) | your own terminal, the worker, the key, the fallback, `doctor`, adapters, the limits, the handoff warning, environment variables |
| [docs/events.md](docs/events.md) | the event log, and `saved`, which adds it up with its prices |
| [docs/versions.md](docs/versions.md) | the version hook and the changelog |
| [docs/development.md](docs/development.md) | the checks, measuring a change, and the notes behind every millisecond of ccsaver's own |
| [docs/measurements.md](docs/measurements.md) | the notes behind every number a session sees |

Before writing or reviewing code, read [CONTRIBUTING.md](CONTRIBUTING.md): every rule, with its guard and an example from this code.

Gate, all green before a change is done: `pnpm test && pnpm typecheck && pnpm lint && claude plugin validate .`

House laws:

- `src/` imports `node:` built-ins and its own files: zero runtime dependencies.
- Names carry the meaning: code has no comments.
- Every function is an arrow const with an explicit return type; `unknown` is narrowed by a guard that checks at run time, and `as const` is the only `as`.
- Every file stays under this project's own gate, 350 lines and 32 KB: split by responsibility first. Two are excused in `UNREAD_WHOLE`, `pnpm-lock.yaml` and `CHANGELOG.md`, and nothing else joins them without the owner's word.
- Every directory stays under six files: the sixth regroups it by feature, and what every feature imports lives in `src/state/`. Only the root is excused, because its files are the ones the tools look for there.
- Every name below the root is kebab-case, and every TypeScript file is `name.role.ts`, the role from the list of CONTRIBUTING 2.6. The root and `SKILL.md` are excused, because the tools look for them by name.
- A development dependency, or a rule or override in `biome.json`, waits for the owner's approval.
- Commits: `type: subject` in English, a bullet-list body. The type sets the version: a git hook (`git config core.hooksPath .githooks`, once per clone) writes it and `CHANGELOG.md`, never a hand.
