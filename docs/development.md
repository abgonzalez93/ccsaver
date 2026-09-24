# Development

The checks, and how to measure whether ccsaver saves you anything. The rules the code follows are in [CONTRIBUTING.md](../CONTRIBUTING.md), the version hook in [versions.md](versions.md).

```bash
pnpm install
pnpm test        # node --test, no network: a fake server and a fake claude binary
pnpm typecheck
pnpm lint
claude plugin validate .
```

The first three run in CI; the fourth is typed by hand, because a read-only CI that pins every action by SHA has nowhere to put an unpinned global install of Claude Code. What it would have caught on its own, `test/repo/skills.test.ts` holds: both manifests name the same plugin and the same version, the hook file `hooks.json` points at exists and is executable, and so are the launcher and the two git hooks.

`CCSAVER_HOME` relocates the state folder; the tests use it and nothing else, and `pnpm test` starts from one that does not exist, and from a `HOME` that does not exist either, so a test that forgets its own cannot touch your key or your launcher.

Once the gate is green and the commit made, `pnpm release` pushes `main` with its tags and then refreshes the plugin this machine runs, `claude plugin marketplace update abgonzalez93 && claude plugin update ccsaver@abgonzalez93`: the installed copy comes from the marketplace, never from this folder, so editing here changes nothing until that runs ([Update](../README.md#update)). The push is what makes the release workflow sweep for a `v*.*.0` tag ([versions](versions.md)).


## Measure the hook

Rule 4.4 of [CONTRIBUTING](../CONTRIBUTING.md) asks for a number before and after any change to what the hook imports, and [measurements.md](measurements.md#hook-overhead-per-read) keeps them. The harness behind the recent ones:

- a throwaway `CCSAVER_HOME` with a `plugged` line naming a throwaway project and an empty `log/`, so the hook takes the path that writes a line; in the project, a 100-line file it lets through and a 500-line one it denies;
- a 300 KB transcript of assistant lines carrying a `usage` block and 2 KB tool results, named in the `transcript_path` of the hook's input beside a `session_id`;
- the tree before the change, from `git worktree add /tmp/before HEAD`, and the working tree after it;
- `sh hooks/gate read-gate` from one tree, then from the other, 30 times in turn on the same input after three warm-up runs, the mean per arm; three such rounds per file;
- the same run once with the two trees identical, which says how far apart two equal arms sit on this machine: 1.8 ms on the allow path and 0.1 ms on the deny path, the last time.

A difference inside that floor is noise, and the note says so.

## Measure it yourself

Run the same prompt twice in headless mode, once with the project plugged and once unplugged, and compare `total_cost_usd` and `duration_ms`:

```bash
claude -p "which functions does src/big-file.ts export?" --output-format json
```

Use several runs per arm; single runs differ by more than the effect you are looking for.
