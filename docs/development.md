# Development

The checks, and how to measure whether ccsaver saves you anything. The rules the code follows are in [CONTRIBUTING.md](../CONTRIBUTING.md), the version hook in [versions.md](versions.md).

```bash
pnpm install
pnpm test        # node --test, no network: a fake server and a fake claude binary
pnpm typecheck
pnpm lint
claude plugin validate .
```

The first three run in CI; the fourth is typed by hand, because a read-only CI that pins every action by SHA has nowhere to put an unpinned global install of Claude Code. What it would have caught on its own, `test/skills.test.ts` holds: both manifests name the same plugin and the same version, the hook file `hooks.json` points at exists and is executable, and so are the launcher and the two git hooks.

`CCSAVER_HOME` relocates the state folder; the tests use it and nothing else, and `pnpm test` starts from one that does not exist, so a test that forgets its own cannot touch yours.


## Measure it yourself

Run the same prompt twice in headless mode, once with the project plugged and once unplugged, and compare `total_cost_usd` and `duration_ms`:

```bash
claude -p "which functions does src/big-file.ts export?" --output-format json
```

Use several runs per arm; single runs differ by more than the effect you are looking for.
