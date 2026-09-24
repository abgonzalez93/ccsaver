# Measurements

The notes behind [Honest limits](../README.md#honest-limits). Measured on one TypeScript monorepo with Claude Code 2.1, small samples (1–4 sessions per cell). Every number carries its sample size; treat them as a starting point and [measure your own](development.md#measure-it-yourself).

## The hook on a locate-or-describe task

−16 % session cost, 0.58 $ against 0.69 $ unplugged. Replicated twice more: 0.60 $ and 0.56 $ against 0.72 $ and 0.66 $.

## The hook on a judgement question

No saving and 3.6× slower, 230 s against 64 s. The model pages through ranges and delegates on top of that, so it pays for both. The diagnosis is the limit, not the approach: the file was under the size where delegating pays, so denying it bought nothing. [Limits](configuration.md#limits) is the knob, and `plug` now measures what it should be.

## What a repository asks for

What `ccsaver plug` reports, one walk each. This repository: 67 of 67 files, 19 in 20 under 285 lines and 3,237 tokens, which the defaults already fit. One TypeScript application monorepo with no line rule of its own: 334 of 933 files, under 396 lines and 4,907 tokens, which asks for `maxLines` 400. The published sources of `@types/node` and `undici-types`, as a stand-in for library code: 75 files, under 2,835 lines and 33,595 tokens, which asks for 2,850 and 34,000.

Three corpora, a 10× spread in what they ask for, and the defaults are right for exactly one of them. That is why the number is measured per project instead of chosen once.

## The cost of measuring a repository

10.9–24.8 ms on the 933-file monorepo and 1.1–1.6 ms on this repository, five runs each, warm cache. It runs in `plug` and in `doctor`, never in the hook.

Three things keep it there. `readdirSync` with `recursive: true` took 1,480 ms on the same tree for 189,295 entries, because it cannot prune and it descends into symlinked directories, which in a pnpm workspace walks the linked packages again; the manual walk reaches the same 933 files in 0.8 ms. And reading only the first 8 KB to tell a binary file from a text one, before reading the whole of it, held the monorepo at 9–10 ms where reading every file whole ran 13–46 ms and swung with the cache.

The third is that those 8 KB are now what a file that ends inside them is counted from, instead of being read and then read again: `/usr/include`, 2,385 files, 42.9–46.5 ms against 51.6–56.9 ms, three rounds of seven runs per arm, with the same lengths reported. Dropping the probe instead of reusing it is the trap: on 200 binaries of 900 KB beside 200 text files it costs 28.4 ms against 12.1, because 180 MB that the probe leaves unread get read whole. Reusing it does not move that tree, 12.7 and 15.8 ms against 12.4 and 15.0.

## Delegated writing of a test file

A ~110-line test file came out break-even: 0.80–1.02 $ delegated against 0.85 $ written directly. The cost is the review, not the writing.


A second call on 2026-09-23, one of the two of a live check: a 15-line test file whose spec named its import as `../src/state/config.store.ts` came back with the reference's path, `../../src/…`, so the file did not load, and passed 3 of 3 once that one import was fixed; the formatter had run and the `warn:` line stayed silent. n = 1, and the skill's warning to name the module of every import stands.

## Where delegation starts to pay

Roughly 2,000–3,000 lines and up.

## The rules of an adapter

`gemini-flash-lite-latest` through an OpenAI-compatible endpoint, ccsaver 0.9.14, four `code-write` runs per arm with the same spec and the same two reference files: `src/state/state.store.ts`, which exports the function asked for, and a test file that imports from a different module with the real extension. The only difference between the arms is whether the plugged project points at an adapter carrying the `rules` of [`adapters/strict-ts.json`](../adapters/strict-ts.json).

- A return type on the `test` callback: **3 of 4 with the rules, 0 of 4 without**, where the four without copied the reference.
- Importing the function from the module that exports it, with the real extension: **4 of 4 in both arms**, with the spec not naming the module and the reference importing from another one.

So the rules reach the worker and change what it writes. They do not make it match this repository better: the rule says *every function is an arrow const with an explicit return type*, a `test` callback is neither, and this repository's own tests write `() =>` there with the lint green.

The line this note replaces credited the rules with that import instead, 4 of 4 against 0 of 4. It was written with the first commit, its conditions were never recorded, and it does not reproduce against this worker.

## The cost of the node version check

14 ms per command, mean of 20 runs, three rounds: `ccsaver list` ran in 32.3 ms on its own and 46.7 ms behind the `node -e` that reads `process.versions.node`, which is a second process start.

That is why the check guards `setup`, `doctor` and `plug` and not every command. Those three are what a person types before anything works, and each already costs more than 14 ms; `bulk-read` and `code-write` are typed by a skill after setup has run, and the hook never sees the launcher at all. A node too old to strip types shows itself there as a parse error rather than as a sentence, which is the price of not paying 14 ms on a path that runs on every delegation.

## The fixed cost of the skill descriptions

Seven entries, two skills and five slash commands, 983 bytes of descriptions in the skill listing every session loads: 266 tokens, in every project, plugged or not, measured as the difference in input tokens of one `claude -p` prompt with and without the listing's text appended (32,229 against 32,495, on Haiku, one tokenizer for the family); ≈ 0.003 $ a session at a frontier model's input rate. In print mode the listing carries the names only: 28 to 38 tokens by the same method, three runs per arm with the plugin enabled and disabled. Read from cache on every request after the first, it came to 2.47 M cache-read tokens over 83 sessions and 9,291 requests in six days of one machine. The 188 given here before was the two skill descriptions alone, measured in a session.

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

Letting the `sh` gate answer alone, with the log off and no adapter, what Node would let through anyway, a file under 350 line breaks and 32,000 bytes by `wc -lc`, or a read with an `offset` or a `limit`, and hand Node the rest through a pipe: a 100-line file let through, 25.0 / 23.7 / 22.7 ms before against 4.5 / 4.5 / 4.3 ms after; a ranged read, 22.9 / 22.8 / 23.3 against 2.1 / 2.1 / 2.1 ms; a 500-line file denied, 26.7 / 26.0 / 26.1 against 29.1 / 28.9 / 29.0 ms, the pipe and the `wc` it now pays; with the log on, the same 100-line file 25.3 / 24.9 / 25.3 against 25.5 / 24.5 / 25.3 ms and the 500-line one 27.4 / 28.3 / 27.6 against 27.3 / 27.2 / 28.0 ms, because every `Read` still goes to Node, which is what a line of the log needs; unplugged 1.8 against 1.7–1.8 ms. Three rounds of 30 runs per arm, paired, a 300 KB transcript; two identical trees measured the same way sat 0.0 ms apart on the allow path and 0.1 ms on the deny path. Of the reads one machine's log holds, 77 % pass whole and 19 % are ranged, so the log off and no adapter turns 24 ms into about 5 for 96 of every 100.

Folders cost it nothing either. When `src/` regrouped by feature and the hook's three imports moved into `src/state/`: 21.3 / 20.6 / 21.0 ms flat against 21.4 / 20.6 / 20.4 ms in folders, three rounds of 30 runs per arm, paired, both trees on the same disk. A first pair with the flat copy on `tmpfs` read 2 ms in favour of the folders, which was the disk and not the layout: what the hook pays for is a module, never the depth of its path.

## The handoff hook per turn

Three rounds of 30 runs per arm, paired, process spawn included, on a 4 MB transcript whose last line holds the count, with the warning already given for the multiple the count sits in, which is what every turn but the crossing one costs: **1.7 / 1.7 / 1.7 ms in an unplugged project and 1.7 / 1.7 / 1.7 ms in a plugged one with the warning off**, where `hooks/gate` exits in `sh` before Node starts, and **27.2 / 27.3 / 25.9 ms with it on**: Node's start-up with four modules, the tail of the transcript parsed, and the marker read; [reading 16 KB of it first](#reading-the-model-out-of-the-transcript) took the last figure to 24.2 / 24.3 / 24.3 ms. The `Read` gate did not move when the switch line joined the launcher: 24.3 / 23.9 / 24.3 ms before against 24.0 / 24.0 / 23.7 ms after.

The fifth slash command's description is one of the seven entries [measured together](#the-fixed-cost-of-the-skill-descriptions) at 266 tokens.

## Where the handoff limit comes from

175 session transcripts of one machine, all from the VS Code extension, Claude Code 2.1.220 to 2.1.280, read on 2026-09-23 by a script that prints numbers and nothing else; 85 of them are working sessions of 20 requests or more, the rest probes. Context is the status line's sum over the last response of each request.

- Where sessions end: p50 104k tokens, p75 268k, p90 495k, p95 847k, max 1,000k. Of the working sessions, 76 % pass 200k, 42 % pass 300k and 32 % pass 400k. Twelve compactions in nine sessions were automatic, at 967k–1,006k, and one manual, at 519k: nobody compacts at 200k.
- Growth: 1,697 tokens per request at the median (p90 6,978), 8,509 per turn (p90 86,978, p99 321,949), 12.3 requests per turn. One turn in ten grows by more than 87,000 tokens, which is what a warning given at the end of the turn can be late by.
- After crossing 200k a session makes 46 more requests at the median (p90 268), each carrying the whole history. Had those run in a new session opened with a 10,000-token handoff over the project's own base (39k–46k tokens for a first request), the input they carried would have been 31 % smaller; 44 % at 300k and 54 % at 400k, limits that reach fewer sessions. The estimate assumes the new session grows as the old one did and re-reads nothing, so it is a ceiling.
- A real handoff costs 6.6k–14.5k tokens to read: six hand-written ones of 15–28 KB, measured as the difference in context around their `Read`, 2.2 bytes per token with line numbers.
- Effective rates fitted on the cost lines of 15 Opus 5 sessions, residual 0.0 %: 5 $/M input, 25 $/M output, 0.50 $/M cache read, 10 $/M cache write, with no premium past 200k in sessions that reached 966k. At those rates the median session that crosses 200k would have spent 3.5 $ less.

200,000 is the default because that is where three working sessions in four still have 46 requests ahead of them, and because it is the count the author was already applying by hand.

## Reading the model out of the transcript

0.156 ms, mean of 200 runs, on a 2.5 MB transcript: open, read the last 64 KB, split it and `JSON.parse` each whole line, keep the `model` of the last assistant one. A naive regex over the same slice took 0.071 ms but reads a model name written in the conversation as the one in force, which this very repository's sessions produce.

Per `Read`, paired on the same machine, three rounds of 30 runs per arm: **21-23 ms before and 19-21 ms after with the log off**, where the hook never looks, and **21-22 ms before against 22 ms after with the log on**. The lookup sits inside the branch that writes the line, so the default costs nothing.

Reading the last 16 KB first, and the 256 KB only when no assistant line sits in them, because in `PreToolUse` the last assistant line is the one that asked for the tool and in `Stop` it is the last line of the file: a 100-line file let through with the log on, **27.6 / 28.2 / 27.7 ms before against 25.2 / 24.8 / 25.7 ms after**; the 500-line file denied by lines, 28.2 / 27.9 / 29.2 against 27.0 / 26.9 / 27.4 ms; the handoff hook on a turn that crosses nothing, **27.0 / 26.5 / 26.9 against 24.2 / 24.3 / 24.3 ms**. Three rounds of 30 runs per arm, paired, a 300 KB transcript of 2 KB lines whose last line is the assistant's, every round after below every round before; the two trees measured identical the same day sat 0.3–0.6 ms apart. In process the 256 KB read and parse took 0.35 ms on that transcript and the 16 KB one 0.02, p50 of 200; a transcript whose last assistant line sits further back than 16 KB, a tool result of 200 KB after it, pays both reads, 0.02 ms more than before.

## The hook on a file past the byte limit

A 300 MB text file in a plugged project, 3 runs per arm, peak resident memory from `/usr/bin/time -f %M` with the process spawn included. Reading it whole to count its lines cost 371 MB and 0.23–0.38 s; deciding from `statSync` and reading 8 KB to tell text from binary costs 73 MB and 0.04–0.05 s. The decision is the same `deny` either way.

The per-`Read` cost of an ordinary file did not move: 1.7–1.9 ms unplugged and 21.5–22.4 ms plugged, against 1.9 ms and 22.2 ms before, two rounds of 30 runs per arm on the same machine.

Since the gate stopped denying what `bulk-read` would refuse, a file past the byte limit that is about to be denied is read whole once, for that check alone, when it is 1 MB or under; past that it is denied unread, so the 300 MB case above does not move, and the 150 KB one costs the [half a millisecond](#hook-overhead-per-read) of the paragraph above.

## One-shot worker vs a subagent

For the same read: 4–8 s and 0.03–0.07 $ for the one-shot worker, against 26–169 s and up to 0.14 $ for a subagent. The worker's side has since fallen: with `gemini-flash-lite-latest` on 2026-09-24 a real `bulk-read` took 1.03 / 1.15 / 1.12 s of wall clock for a 100-line file, 968 / 1,093 / 1,060 ms of it at the endpoint, and 1.37 s, 1,313 ms, for 150 KB, nine calls in all. DNS, TCP and TLS are 55–90 ms of that, and there is no streaming, so the first byte is the whole answer; the 30 s the call waits are six times the worst normal case, 2,048 tokens at about 435 a second.

## The length of pnpm test

9.4 / 9.1 / 9.2 s on a 12-core machine, 318 tests in 34 files, and the wall is the CPU, not the longest file: one run costs 53 s of user time and 20 s of system time, 73 s at 782 %, which is 6.1 s of twelve cores kept busy, because every test that starts the hook, the CLI, a fake `claude` or a fake server pays a process. Splitting `test/doctor/doctor.test.ts`, 6.3 s on its own, into two files of 3.6 and 3.9 s left the wall at 9.5 / 9.2 / 9.1 s, so the split was not kept; `--test-concurrency=4` took it to 14.6 s. What would shorten it is fewer processes per test, not shorter files.

## An answer cut at the output limit

Six days of one machine's log, 2026-09-19 to 24: 23 delegations, one of them back with `finish_reason: length` after 25,237 ms, the fallback off, so a 33 KB file was sent for nothing. Five probes with a 100-line file on 2026-09-24: four answered in 73–107 tokens and 982–1,198 ms, one in 2,044 tokens and 4,794 ms, cut at the 2,048 the call asks for, because the model started writing and did not stop; the worker charges the 2,044 all the same. So `bulk-read` keeps a cut answer, with a note, and `code-write` still falls back: the first is bullets, each checked against the file, and the second is a file that has to be whole.

## The Haiku fallback on one 8,230-token call

This README with line numbers, Claude Code 2.1.274, subscription login, one run per arm: 0.0257 $ → 0.0128 $ once the fallback stopped asking for a session title, a second hidden request that carried the whole file again, and wrote a 5-minute cache instead of a 1-hour one. A follow-up question on the same file read 0 tokens from that cache either way.

Around the request rather than in it: Claude Code 2.1.281, the fallback's exact flags, a 2.6k-token prompt, Haiku, three runs per arm on 2026-09-24. As shipped, 2,983 / 2,673 / 2,649 and 2,733 / 2,818 / 2,597 ms of wall clock for 1,435–1,657 ms of `duration_ms`, at 0.0031 $ a call; `--debug-file` puts the rest in an update check, a request for claude.ai's MCP servers made under `--strict-mcp-config`, and a telemetry batch posted after the answer, about 0.6 s of it before the first debug line, which is loading the binary and has no flag. With `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` in the child's environment and its `--settings`: **1,658 / 1,899 / 1,845 ms**, `duration_api_ms` unchanged at 1,413–1,657, 113 fewer input tokens, 0.0029–0.0030 $. `--bare`, the documented way to a lighter start, answered `Not logged in` in 679 ms: it does not read a subscription login. `--safe-mode` and `--setting-sources user` moved nothing.

## Adding up a month of the log

A synthetic month of 200,000 `gate` lines, 66.6 MB, added up by `ccsaver saved 2026-08`: **0.39-0.44 s and 219 MB of peak RSS**, against 0.59 s and 317 MB while the reader built an array of every row of the month first. The fold holds one row at a time, so what is left is the month's own text, read whole with `readFileSync`.

Reading it as a stream instead takes the same work to 0.31 s and 80 MB, but it makes the reader asynchronous, and `src/` reads files synchronously for the reason 4.1 of [CONTRIBUTING](../CONTRIBUTING.md) gives. At the 181 denied reads a month of the worked example, 66.6 MB is about 900 years of log, so the ceiling is written down here rather than paid for.

The table of what followed each denial, one entry per session and file, was copied whole on every denial and on every ranged read that followed one, from 0.25.0 to 0.25.3, which is quadratic in the files denied: 5,000 denials of 5,000 files took 2.54 / 2.58 / 2.51 s, 10,000 took 11.40 / 10.95 / 10.53 s, 20,000 took 49.54 / 47.39 / 47.00 s, and a month of 200,000 lines over 2,000 session-and-file pairs, a quarter of them denials, 96 MB, took 1.45 / 1.57 / 1.53 s at 282 MB of peak RSS. `src/saved/saved.service.ts` · `pagedAfter` now writes into one `Map` the fold carries, the way `readEvents` pushes into one array, and the same four take 0.08 / 0.08 / 0.08 s, 0.10 / 0.09 / 0.10 s, 0.11 / 0.12 / 0.11 s and 0.50 / 0.47 / 0.50 s at 284 MB; 200,000 denials of 200,000 files, 92 MB, take 0.52 / 0.56 / 0.51 s at 296 MB. Three runs each, the whole command under `/usr/bin/time`, Node 24.16, lines of about 460 bytes carrying a session, a path and a context, which the 66.6 MB month above did not.

## The citation check in bulk-read

One free model, files up to 493 lines, 183 citations in 18 answers: 175 matched their line and 8 were tagged, in 3 of the answers. The 8 are the same 2 mis-copied words, and 6 citations that end in the line number again, `path:69:70`, with no text to compare (all in one answer).

The check reads the shapes the worker writes as well as the one it asks for: an invented column (`path:69:1:text`), a dangling ` @ `, and the citation written twice. Before it did, 142 matched and 41 were tagged in 7 answers, 39 of them false alarms where the line was right and its shape was not; Claude now receives 15,106 bytes of the 18 answers where it received 15,535. The 4 answers that locate matched 97 of 97, before and after.

Re-read over the 72 saved answers of all 4 wordings, 1,193 citations: the tags fall from 175 to 77, and each of the 1,116 citations the check accepts quotes the line it resolves to, with none moved off its line and none lost.

Confirmed live the same day on 6 fresh answers, the 6 questions that had carried every tag: 40 citations, 40 matched and 0 tagged, where the check as it stood tagged 9 of those same 40 — that time the worker wrote the column as `path:69:7: text`. The literal reading is tried first, so a line that itself opens with `20:` is not read as a column. A false alarm costs a ranged `Read`, never a wrong line.

The earlier wording, `grep -n`, is tagged 20 times of 278 in 3 of 18 answers (38 in 6 before); its first sample, on other files, had matched 268 of 269. In that first sample, asking for the evidence changed what the worker wrote: over 7 questions Claude received 0.7–2.5× the unchecked answer (3 shrank, 4 grew), and the worker itself wrote up to 3.2× more, which took the slowest call from 12 s to 19 s.

## The citation check with the Haiku fallback as the reader

Claude Code 2.1.274; this README, `src/read-gate.hook.ts` and `src/state/state.store.ts`, one file and one question per call, 5 calls per file per wording.

The instruction used to say "the way `grep -n` prints it", and for one file that is `line:text`: 10 of 15 answers carried no citation the check could read, and 58 cited lines reached Claude whole and unchecked. With `grep -Hn` and "the path first even when there is one file", 1 of 15 carried none (it cited `path:line` and no text), 0 citations arrived without their path, 147 matched, 1 was renumbered, 6 were tagged, and Claude received 8,949 bytes where it had received 13,551.

## What ccsaver adds to the session's own context

The denial message the hook writes is 254 characters for a path of 45, so ~64 tokens at chars/4: 189 of them are the fixed text and the rest is the path and the four numbers. It was 376 characters and ~94 until the three sentences it repeated moved out, because the skill's description in the listing every session loads already says when to delegate; the tokenizer counted that one at 114, 3.3 characters a token, which puts this one near 77. The shorter message moved the hook by nothing beyond the guard's half a millisecond: on the deny path, 27.7 / 27.0 / 27.6 ms against 28.2 / 27.9 / 28.2 ms with both changes in, three rounds of 30 runs per arm, paired, log on. The session reads one per denied `Read`, and it reads the worker's answer back on every delegation, which the event log records as `answerChars`. `ccsaver saved` adds both up at the foot of the report and puts neither in a column, because nothing in the log says which model was running when the answer came back.

## What a denial costs after the message

Six days of session transcripts of one machine, 2026-09-18 to 24, Claude Code 2.1.274 to 2.1.281, read on 2026-09-24 by a script that prints counts and names and nothing else. Each denial is taken from the hook's own message inside a tool result, `<path> has N lines`, because 59 of the 96 tool results that hold the text quote the hook's code or its tests. 37 denials: 16 to the main thread, all in the `auto` permission mode, and 21 to subagents; 12 inside the plugged root (`pnpm-lock.yaml` ten times, `src/worker.ts`, `CHANGELOG.md`) and 25 outside it, before 0.24.13 stopped those.

- What followed: nothing 24 times (65 %), paging with `sed`, `head` or `grep` in Bash 7 times, ranged `Read`s 4, a delegation 2, both in test sessions. A follow-up is a later request whose tools touched the same file; the request that receives the denial is not counted, because it would have run either way.
- What it cost: 37 follow-up requests, re-reading 3,005,632 tokens of context, at a median context of 120,403 tokens when denied. The 12 inside the root drew 8 requests and 1,571,318 tokens, 969,172 of them on `CHANGELOG.md` alone: denied at 283,157 tokens of context, then refused by `bulk-read` for a private-key header its own text quotes mid-line, which 0.24.2 stopped refusing three hours later, three requests for a file that never arrived. `src/worker.ts`, 405 lines, was read whole in two ranges, two requests on top of the file. One request at that context is about 12,000 tokens at input price, with cache reads at a tenth of it: fifty to ninety times the message, which the same tokenizer puts at 114 tokens for the 376 characters the section below describes.
- What it saved: the 8 reads of `pnpm-lock.yaml` nobody came back for, 3,900 tokens by bytes/4 each and 1.9–2.8× that as a `Read`, plus what a file that never entered the context is not re-read for by every later request of the session, which no log counts; the sessions of those six days made 112 requests each at the mean.
- What the log never saw: the session that ran this measurement, in the `auto` permission mode on the plugged project, read 1,113 lines of five files with `cat` and left no `gate` line, because in that mode the harness tells the model to read with `cat`, `head` and `sed`; in the 51 `auto` sessions of another project that September, before the plugin, files over 400 lines were read whole 6 times with `Read` against 12 times with `cat`, and 581 times in part through Bash.

`saved` prints the first count at the foot, from the `context` the hook records on every line and the session's own ranged reads that follow a denial of the same file in the same session ([saved](events.md#saved)). It cannot see the `sed` and `cat` follow-ups, 7 of the 13 here, so it undercounts; two ranged reads made in one request count that request twice, so it overcounts; and no column holds the second count.

## The hook's token estimate vs a real Read

Fable 5.1, 9 batches in 2 sessions, line numbers included. The real cost of a whole-file `Read` measured 1.9–2.2× the bytes/4 estimate on batches of 16–27 KB, and 2.1–2.8× on batches of small files: the 8,000-token limit lets through reads of about 16,000 real tokens. A denied `Read` cost 136–251 tokens with the 376-character message; the 254-character one has not been measured in a session.

## The terminal launcher

Mean of 30 runs, process spawn included, 3 warm-ups, one machine, Node 24.16. `~/.local/bin/ccsaver` handing over to a plugin `bin/` found on the `PATH`, which is what a skill pays inside a session: **1.6 ms**, against 1.2 ms for `sh -c :`. From a terminal, reading `installed_plugins.json` with `node -e` and starting `bin/ccsaver version`: **49.4 ms**, against 33.2 ms for `bin/ccsaver version` on its own, so the record costs 16 ms a call, of which the `node -e` alone is 15.3 ms. The hand-written launcher it replaces, `ls | sort -V | tail -1` over the cache, took 36.6 ms and ran the newest folder there, an uninstalled one included. `claude plugin list --json`, the documented way to the same answer, took 129.9 ms and needs `claude` on the terminal's `PATH`, which the VS Code extension does not put there.

Remembering the folder in `launcher-root`, read before `node` and trusted while it is newer than the record: from a terminal whose `PATH` has 24 entries, 10 of them Windows folders under `/mnt/c`, **64.7 / 63.9 / 63.7 ms before against 47.5 / 47.4 / 46.7 ms after**; inside a session, with the plugin's `bin/` as the 25th entry, 47.2 / 47.3 / 46.6 against 47.4 / 46.5 / 48.0 ms, unchanged, because the session's `bin/` is found on the `PATH` first, as it must be. Three rounds of 30 runs per arm, paired, the installed 0.24.19 answering `version`, on 2026-09-24. What is left is the walk of the `PATH`: 12.2 / 12.1 / 12.9 ms of it are the two `stat` calls per Windows folder, 9P at about 0.5 ms each, against 1.3 / 1.3 / 1.4 ms for the same walk without them. Looking at the remembered folder before the walk would save those 12 ms inside a session too, and was not done: a session that updated the plugin an hour ago must keep running the version it loaded.
