# Development

The checks, how to measure whether ccsaver saves you anything, and the notes behind every millisecond of ccsaver's own: the hook on every `Read`, the handoff hook at the end of every turn, the launcher, the fallback's start-up, adding up the log, measuring a repository and the test run. The rules the code follows are in [CONTRIBUTING.md](../CONTRIBUTING.md), the version hook in [versions.md](versions.md).

```bash
pnpm install
pnpm test        # node --test, no network: a fake server and a fake claude binary
pnpm typecheck
pnpm lint
claude plugin validate .
```

The first three run in CI; the fourth is typed by hand, because a read-only CI that pins every action by SHA has nowhere to put an unpinned global install of Claude Code. What it would have caught on its own, `test/repo/skills.test.ts` holds: both manifests name the same plugin and the same version, the hook file `hooks.json` points at exists and is executable, and so are the launcher and the two git hooks. The test run takes about 7 s, [the CPU and the longest file between them](#the-length-of-pnpm-test).

`CCSAVER_HOME` relocates the state folder; the tests use it and nothing else, and `pnpm test` starts from one that does not exist, and from a `HOME` that does not exist either, so a test that forgets its own cannot touch your key or your launcher.

Once the gate is green and the commit made, `pnpm release` pushes `main` with its tags and then refreshes the plugin this machine runs, `claude plugin marketplace update abgonzalez93 && claude plugin update ccsaver@abgonzalez93`: the installed copy comes from the marketplace, never from this folder, so editing here changes nothing until that runs ([Update](../README.md#update)). The push is what makes the release workflow sweep for a `v*.*.0` tag ([versions](versions.md)).


## Measure the hook

Rule 4.4 of [CONTRIBUTING](../CONTRIBUTING.md) asks for a number before and after any change to what the hook imports, and [the notes below](#hook-overhead-per-read) keep them. The harness behind the recent ones:

- a throwaway `CCSAVER_HOME` with a `plugged` line naming a throwaway project and an empty `log/`, so the hook takes the path that writes a line, and one without it, for the path the `sh` gate answers alone; in the project, a 100-line file it lets through and a 500-line one it denies;
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

## The cost of measuring a repository

10.9–24.8 ms on the 933-file monorepo and 1.1–1.6 ms on this repository, five runs each, warm cache. It runs in `plug` and in `doctor`, never in the hook.

Three things keep it there. `readdirSync` with `recursive: true` took 1,480 ms on the same tree for 189,295 entries, because it cannot prune and it descends into symlinked directories, which in a pnpm workspace walks the linked packages again; the manual walk reaches the same 933 files in 0.8 ms. And reading only the first 8 KB to tell a binary file from a text one, before reading the whole of it, held the monorepo at 9–10 ms where reading every file whole ran 13–46 ms and swung with the cache.

The third is that those 8 KB are now what a file that ends inside them is counted from, instead of being read and then read again: `/usr/include`, 2,385 files, 42.9–46.5 ms against 51.6–56.9 ms, three rounds of seven runs per arm, with the same lengths reported. Dropping the probe instead of reusing it is the trap: on 200 binaries of 900 KB beside 200 text files it costs 28.4 ms against 12.1, because 180 MB that the probe leaves unread get read whole. Reusing it does not move that tree, 12.7 and 15.8 ms against 12.4 and 15.0.

## The cost of the node version check

14 ms per command, mean of 20 runs, three rounds: `ccsaver list` ran in 32.3 ms on its own and 46.7 ms behind the `node -e` that reads `process.versions.node`, which is a second process start.

That is why the check guards `setup`, `doctor` and `plug` and not every command. Those three are what a person types before anything works, and each already costs more than 14 ms; `bulk-read` and `code-write` are typed by a skill after setup has run, and the hook never sees the launcher at all. A node too old to strip types shows itself there as a parse error rather than as a sentence, which is the price of not paying 14 ms on a path that runs on every delegation.

## Hook overhead per Read

Mean of 30 runs, process spawn included. 1–3 ms in an unplugged project, where the `sh` gate exits before Node starts. ≈ 4 ms in a plugged one with the log off and no adapter, where the `sh` gate answers a file under the limits or a ranged read on its own, and 2 ms for the ranged read. ≈ 24 ms otherwise, which is Node's start-up with its compile cache; 49 ms without the cache.

That 24 ms was 22 ms while the state folder, the log and the configuration lived in one module. Splitting them into `state.store.ts`, `log.store.ts` and `config.store.ts` costs **1.7 ms per `Read`**, measured paired on the same machine, three rounds of 30 runs per arm: 22.4 / 22.1 / 21.9 ms before against 22.7 / 24.3 / 24.8 ms after, with every round after above every round before. The bytes are the same; the cost is two more module resolutions, about 0.85 ms each. The unplugged path does not move, because the `sh` gate never starts Node.

Reading the last 256 KB of the transcript for the model instead of 64 KB, so that one tool result longer than 64 KB no longer hides the assistant line before it, costs nothing the harness can see: 23.3 / 22.7 / 23.3 ms before against 22.1 / 22.1 / 22.4 ms after, three rounds of 30 runs per arm, log on, an 824 KB transcript of 2 KB lines, compile cache on. The tail is read once and parsed line by line; what the hook waits on is Node's start-up.

Recording the context beside the model, from the `usage` of the same transcript line, costs nothing the harness can see either: 28.1 / 27.5 / 28.0 ms before against 27.9 / 29.5 / 27.0 ms after, three rounds of 30 runs per arm, paired, log on, a 300 KB transcript, on a 100-line file let through.

Asking the boundary guard, before a denial, whether `bulk-read` would take the file, which imports `boundary.guard.ts` on every run and reads a file past the byte limit once more, up to 1 MB, on the deny path only: a 100-line file let through, where the check never runs, 27.6 / 28.6 / 28.9 ms before against 27.9 / 28.8 / 28.5 ms after; a 500-line, 24 KB file denied by lines, 30.1 / 30.1 / 29.7 against 30.7 / 30.5 / 30.3 ms; a 1,800-line, 150 KB file denied by tokens and now read whole for the check, 29.1 / 28.9 / 29.8 against 30.7 / 30.0 / 30.5 ms; the same file with a private-key header in it, denied before and let through now, 29.2 / 29.7 / 29.6 against 30.1 / 29.1 / 29.6 ms. Three rounds of 30 runs per arm, paired, log on. The module costs nothing the allow path can see; the deny path pays about half a millisecond for the check and the second read, inside the spread of its own rounds.

Moving `worker.json` out of `config.store.ts` into `worker.store.ts` costs the hook nothing, because the hook never imported those 77 lines and gains no module: 30.1 / 30.4 ms whole against 31.4 / 30.0 ms split, two rounds of 30 runs per arm, paired, on a machine whose own floor for the harness is 4.2 ms. The two arms sit inside each other's spread, so the split is free, not faster — the only thing that moves a hook import list is a hook import.

The launcher taking the name of the hook it starts, so that a second hook shares it instead of copying it, costs nothing either: 26.2 / 25.8 / 24.8 ms before against 26.4 / 25.9 / 25.1 ms after in a plugged project, and 1.8 against 1.7–1.8 ms unplugged, three rounds of 30 runs per arm, paired.

Sharing the 1 MB ceiling between the hook and the survey as one export of `config.store.ts`, `SCAN_CEILING`, costs nothing the harness can see, because the hook already imported that module: a 100-line file let through, 27.6 / 28.2 / 28.9 ms before against 26.8 / 26.8 / 27.1 ms after; a 500-line, 23 KB file denied by lines, 30.2 / 29.2 / 29.0 against 30.5 / 28.3 / 28.3 ms. Three rounds of 30 runs per arm, paired, log on, a 300 KB transcript; two identical trees measured the same way sat 1.8 ms apart on the allow path and 0.1 ms on the deny path, which is the floor of the harness.

Recording `doctor`'s probe under its own kind, one string comparison on the `tool_use_id` before the line is written, costs nothing the harness can see either: a 100-line file let through, 28.1 / 28.5 / 28.4 ms before against 26.2 / 27.4 / 27.5 ms after; the 500-line file denied by lines, 29.6 / 29.5 / 30.4 against 29.1 / 28.8 / 29.5 ms. Three rounds of 30 runs per arm, paired, log on, a 300 KB transcript.

Letting the `sh` gate answer alone, with the log off and no adapter, what Node would let through anyway, a file under 350 line breaks and 32,000 bytes by `wc -lc` or a read with an `offset` or a `limit`, and hand Node the rest through a pipe: a 100-line file let through, 25.0 / 23.7 / 22.7 ms before against 4.5 / 4.5 / 4.3 ms after; a ranged read, 22.9 / 22.8 / 23.3 against 2.1 / 2.1 / 2.1 ms; a 500-line file denied, 26.7 / 26.0 / 26.1 against 29.1 / 28.9 / 29.0 ms, the pipe and the `wc`. With the log on nothing moves, 25.3 / 24.9 / 25.3 against 25.5 / 24.5 / 25.3 ms let through and 27.4 / 28.3 / 27.6 against 27.3 / 27.2 / 28.0 ms denied, nor unplugged, 1.8 against 1.7–1.8 ms. Three rounds of 30 runs per arm, paired, a 300 KB transcript; two identical trees sat 0.0 ms apart on the allow path and 0.1 ms on the deny path. Of the reads one machine's log holds, 77 % pass whole and 19 % are ranged, so the log off and no adapter turns 24 ms into about 5 for 96 of every 100.

Folders cost it nothing either. When `src/` regrouped by feature and the hook's three imports moved into `src/state/`: 21.3 / 20.6 / 21.0 ms flat against 21.4 / 20.6 / 20.4 ms in folders, three rounds of 30 runs per arm, paired, both trees on the same disk. A first pair with the flat copy on `tmpfs` read 2 ms in favour of the folders, which was the disk and not the layout: what the hook pays for is a module, never the depth of its path. Moving the boundary guard into `src/boundary/` and the fallback out of `worker.client.ts` into `fallback.client.ts` moved nothing either: 24.7 / 24.8 / 25.0 ms before against 25.0 / 25.2 / 25.0 ms after on the 100-line file let through, and 27.4 / 27.8 / 27.6 against 27.4 / 27.5 / 27.4 ms on the 500-line file denied, three rounds of 30 runs per arm, paired, log on; the hook imports the same four modules by another path.

## The handoff hook per turn

Three rounds of 30 runs per arm, paired, process spawn included, on a 4 MB transcript whose last line holds the count, with the warning already given for the multiple the count sits in, which is what every turn but the crossing one costs: **1.7 / 1.7 / 1.7 ms in an unplugged project and 1.7 / 1.7 / 1.7 ms in a plugged one with the warning off**, where `hooks/gate` exits in `sh` before Node starts, and **27.2 / 27.3 / 25.9 ms with it on**: Node's start-up with four modules, the tail of the transcript parsed, and the marker read; [reading 16 KB of it first](#reading-the-model-out-of-the-transcript) took the last figure to 24.2 / 24.3 / 24.3 ms. The `Read` gate did not move when the switch line joined the launcher: 24.3 / 23.9 / 24.3 ms before against 24.0 / 24.0 / 23.7 ms after.

The fifth slash command's description is one of the seven entries [measured together](measurements.md#the-fixed-cost-of-the-skill-descriptions) at 266 tokens.

## Reading the model out of the transcript

0.156 ms, mean of 200 runs, on a 2.5 MB transcript: open, read the last 64 KB, split it and `JSON.parse` each whole line, keep the `model` of the last assistant one. A naive regex over the same slice took 0.071 ms but reads a model name written in the conversation as the one in force, which this very repository's sessions produce.

Per `Read`, paired on the same machine, three rounds of 30 runs per arm: **21-23 ms before and 19-21 ms after with the log off**, where the hook never looks, and **21-22 ms before against 22 ms after with the log on**. The lookup sits inside the branch that writes the line, so the default costs nothing.

Reading the last 16 KB first, and the 256 KB only when no assistant line sits in them, because in `PreToolUse` the last assistant line is the one that asked for the tool and in `Stop` it is the last line of the file: a 100-line file let through with the log on, **27.6 / 28.2 / 27.7 ms before against 25.2 / 24.8 / 25.7 ms after**; the 500-line file denied by lines, 28.2 / 27.9 / 29.2 against 27.0 / 26.9 / 27.4 ms; the handoff hook on a turn that crosses nothing, **27.0 / 26.5 / 26.9 against 24.2 / 24.3 / 24.3 ms**. Three rounds of 30 runs per arm, paired, a 300 KB transcript of 2 KB lines whose last line is the assistant's, every round after below every round before; the two trees measured identical the same day sat 0.3–0.6 ms apart. In process the 256 KB read and parse took 0.35 ms on that transcript and the 16 KB one 0.02, p50 of 200; a transcript whose last assistant line sits further back than 16 KB, a tool result of 200 KB after it, pays both reads, 0.02 ms more than before.

## The hook on a file past the byte limit

A 300 MB text file in a plugged project, 3 runs per arm, peak resident memory from `/usr/bin/time -f %M` with the process spawn included. Reading it whole to count its lines cost 371 MB and 0.23–0.38 s; deciding from `statSync` and reading 8 KB to tell text from binary costs 73 MB and 0.04–0.05 s. The decision is the same `deny` either way.

The per-`Read` cost of an ordinary file did not move: 1.7–1.9 ms unplugged and 21.5–22.4 ms plugged, against 1.9 ms and 22.2 ms before, two rounds of 30 runs per arm on the same machine.

Since the gate stopped denying what `bulk-read` would refuse, a file past the byte limit that is about to be denied is read whole once, for that check alone, when it is 1 MB or under; past that it is denied unread, so the 300 MB case above does not move, and the 150 KB one costs the [half a millisecond](#hook-overhead-per-read) of the paragraph above.

## The length of pnpm test

9.4 / 9.1 / 9.2 s on a 12-core machine, 318 tests in 34 files, and the wall is the CPU, not the longest file: one run costs 53 s of user time and 20 s of system time, 73 s at 782 %, which is 6.1 s of twelve cores kept busy, because every test that starts the hook, the CLI, a fake `claude` or a fake server pays a process. Splitting `test/doctor/doctor.test.ts`, 6.3 s on its own, into two files of 3.6 and 3.9 s left the wall at 9.5 / 9.2 / 9.1 s, so the split was not kept; `--test-concurrency=4` took it to 14.6 s. What would shorten it is fewer processes per test, not shorter files. Two changes on 2026-09-24, 325 tests: one compile cache shared by every `node` the run starts, `NODE_COMPILE_CACHE` in the `test` script, because each throwaway state folder had been handing the CLI a cold one, took it from 9.30 / 9.15 / 9.21 s to 7.33 / 7.24 / 7.28 s and 52 + 20 s of CPU to 28 + 14, a CLI start being 31 ms warm against 79 ms cold, 10 runs each; and the fake `claude` written in `sh` instead of Node, one process start less per `doctor` and per fallback, 9.05 / 9.14 / 9.02 s alone and 7.26 / 7.23 / 7.22 s beside the cache. The longest file, `test/doctor/doctor.test.ts`, takes 5.5 s alone and now sets the wall: each of its `doctor` runs pays the launcher's Node version check, about 30 ms, which calling the CLI directly would save, 1.3 s in all.

## The Haiku fallback on one 8,230-token call

This README with line numbers, Claude Code 2.1.274, subscription login, one run per arm: 0.0257 $ → 0.0128 $ once the fallback stopped asking for a session title, a second hidden request that carried the whole file again, and wrote a 5-minute cache instead of a 1-hour one. A follow-up question on the same file read 0 tokens from that cache either way.

Around the request rather than in it: Claude Code 2.1.281, the fallback's exact flags, a 2.6k-token prompt, Haiku, three runs per arm on 2026-09-24. As shipped, 2,983 / 2,673 / 2,649 and 2,733 / 2,818 / 2,597 ms of wall clock for 1,435–1,657 ms of `duration_ms`, at 0.0031 $ a call; `--debug-file` puts the rest in an update check, a request for claude.ai's MCP servers made under `--strict-mcp-config`, and a telemetry batch posted after the answer, about 0.6 s of it before the first debug line, which is loading the binary and has no flag. With `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` in the child's environment and its `--settings`: **1,658 / 1,899 / 1,845 ms**, `duration_api_ms` unchanged at 1,413–1,657, 113 fewer input tokens, 0.0029–0.0030 $. `--bare`, the documented way to a lighter start, answered `Not logged in` in 679 ms: it does not read a subscription login. `--safe-mode` and `--setting-sources user` moved nothing.

## Adding up a month of the log

A synthetic month of 200,000 `gate` lines, 66.6 MB, added up by `ccsaver saved 2026-08`: **0.39-0.44 s and 219 MB of peak RSS**, against 0.59 s and 317 MB while the reader built an array of every row of the month first. The fold holds one row at a time, so what is left is the month's own text, read whole with `readFileSync`.

Reading it as a stream instead takes the same work to 0.31 s and 80 MB, but it makes the reader asynchronous, and `src/` reads files synchronously for the reason 4.1 of [CONTRIBUTING](../CONTRIBUTING.md) gives. At the 181 denied reads a month of the worked example, 66.6 MB is about 900 years of log, so the ceiling is written down here rather than paid for.

The table of what followed each denial, one entry per session and file, was copied whole on every denial and on every ranged read that followed one, from 0.25.0 to 0.25.3, which is quadratic in the files denied: 5,000 denials of 5,000 files took 2.54 / 2.58 / 2.51 s, 10,000 took 11.40 / 10.95 / 10.53 s, 20,000 took 49.54 / 47.39 / 47.00 s, and a month of 200,000 lines over 2,000 session-and-file pairs, a quarter of them denials, 96 MB, took 1.45 / 1.57 / 1.53 s at 282 MB of peak RSS. `src/saved/saved.service.ts` · `pagedAfter` now writes into one `Map` the fold carries, and the same four take 0.08 / 0.08 / 0.08 s, 0.10 / 0.09 / 0.10 s, 0.11 / 0.12 / 0.11 s and 0.50 / 0.47 / 0.50 s at 284 MB; 200,000 denials of 200,000 files, 92 MB, take 0.52 / 0.56 / 0.51 s at 296 MB. Three runs each, the whole command under `/usr/bin/time`, Node 24.16, lines of about 460 bytes carrying a session, a path and a context, which the 66.6 MB month above did not.

## The terminal launcher

Mean of 30 runs, process spawn included, 3 warm-ups, one machine, Node 24.16. `~/.local/bin/ccsaver` handing over to a plugin `bin/` found on the `PATH`, which is what a skill pays inside a session: **1.6 ms**, against 1.2 ms for `sh -c :`. From a terminal, reading `installed_plugins.json` with `node -e` and starting `bin/ccsaver version`: **49.4 ms**, against 33.2 ms for `bin/ccsaver version` on its own, so the record costs 16 ms a call, of which the `node -e` alone is 15.3 ms. The hand-written launcher it replaces, `ls | sort -V | tail -1` over the cache, took 36.6 ms and ran the newest folder there, an uninstalled one included. `claude plugin list --json`, the documented way to the same answer, took 129.9 ms and needs `claude` on the terminal's `PATH`, which the VS Code extension does not put there.

Remembering the folder in `launcher-root`, read before `node` and trusted while it is newer than the record: from a terminal whose `PATH` has 24 entries, 10 of them Windows folders under `/mnt/c`, **64.7 / 63.9 / 63.7 ms before against 47.5 / 47.4 / 46.7 ms after**; inside a session, with the plugin's `bin/` as the 25th entry, 47.2 / 47.3 / 46.6 against 47.4 / 46.5 / 48.0 ms, unchanged, because the session's `bin/` is found on the `PATH` first, as it must be. Three rounds of 30 runs per arm, paired, the installed 0.24.19 answering `version`, on 2026-09-24. What is left is the walk of the `PATH`: 12.2 / 12.1 / 12.9 ms of it are the two `stat` calls per Windows folder, 9P at about 0.5 ms each, against 1.3 / 1.3 / 1.4 ms for the same walk without them. Looking at the remembered folder before the walk would save those 12 ms inside a session too, and was not done: a session that updated the plugin an hour ago must keep running the version it loaded.
