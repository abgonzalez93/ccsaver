# ccsaver

The [README](README.md) and the pages it links under [docs/](docs/) are the specification: a behaviour change edits the page that covers it, in the same commit.

| Page | What it specifies |
| --- | --- |
| [README.md](README.md) | what ccsaver is, the quickstart, the honest limits, what leaves your machine, the commands |
| [docs/configuration.md](docs/configuration.md) | the worker, the key, the fallback, `doctor`, adapters, environment variables |
| [docs/events.md](docs/events.md) | the event log |
| [docs/versions.md](docs/versions.md) | the version hook and the changelog |
| [docs/development.md](docs/development.md) | the checks, and measuring a change |
| [docs/measurements.md](docs/measurements.md) | the notes behind every number |

Before writing or reviewing code, read [CONTRIBUTING.md](CONTRIBUTING.md): every rule, with its guard and an example from this code.

Gate, all green before a change is done: `pnpm test && pnpm typecheck && pnpm lint && claude plugin validate .`

House laws:

- `src/` imports `node:` built-ins and its own files: zero runtime dependencies.
- Names carry the meaning: code has no comments.
- Every function is an arrow const with an explicit return type; `unknown` is narrowed by a guard that checks at run time, and `as const` is the only `as`.
- Every file stays under this project's own gate, 350 lines and 32 KB: split by responsibility first. Two are excused in `UNREAD_WHOLE`, `pnpm-lock.yaml` and `CHANGELOG.md`, and nothing else joins them without the owner's word.
- A development dependency, or a rule or override in `biome.json`, waits for the owner's approval.
- Commits: `type: subject` in English, a bullet-list body. The type sets the version: a git hook (`git config core.hooksPath .githooks`, once per clone) writes it and `CHANGELOG.md`, never a hand.
