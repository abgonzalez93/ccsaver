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

## Where delegation starts to pay

Roughly 2,000–3,000 lines and up.

## The rules of an adapter

`gemini-flash-lite-latest` through an OpenAI-compatible endpoint, ccsaver 0.9.14, four `code-write` runs per arm with the same spec and the same two reference files: `src/state.ts`, which exports the function asked for, and a test file that imports from a different module with the real extension. The only difference between the arms is whether the plugged project points at an adapter carrying the `rules` of [`adapters/strict-ts.json`](../adapters/strict-ts.json).

- A return type on the `test` callback: **3 of 4 with the rules, 0 of 4 without**, where the four without copied the reference.
- Importing the function from the module that exports it, with the real extension: **4 of 4 in both arms**, with the spec not naming the module and the reference importing from another one.

So the rules reach the worker and change what it writes. They do not make it match this repository better: the rule says *every function is an arrow const with an explicit return type*, a `test` callback is neither, and this repository's own tests write `() =>` there with the lint green.

The line this note replaces credited the rules with that import instead, 4 of 4 against 0 of 4. It was written with the first commit, its conditions were never recorded, and it does not reproduce against this worker.

## The cost of the node version check

14 ms per command, mean of 20 runs, three rounds: `ccsaver list` ran in 32.3 ms on its own and 46.7 ms behind the `node -e` that reads `process.versions.node`, which is a second process start.

That is why the check guards `setup`, `doctor` and `plug` and not every command. Those three are what a person types before anything works, and each already costs more than 14 ms; `bulk-read` and `code-write` are typed by a skill after setup has run, and the hook never sees the launcher at all. A node too old to strip types shows itself there as a parse error rather than as a sentence, which is the price of not paying 14 ms on a path that runs on every delegation.

## The fixed cost of the skill descriptions

The two skill descriptions cost about 188 tokens per session, in every project, plugged or not: ≈ 0.006 $ on a frontier model.

## Hook overhead per Read

Mean of 30 runs, process spawn included. 1–3 ms in an unplugged project, where the `sh` gate exits before Node starts. ≈ 24 ms in a plugged one, which is Node's start-up with its compile cache; 49 ms without the cache.

That 24 ms was 22 ms while the state folder, the log and the configuration lived in one module. Splitting them into `state.ts`, `log.ts` and `config.ts` costs **1.7 ms per `Read`**, measured paired on the same machine, three rounds of 30 runs per arm: 22.4 / 22.1 / 21.9 ms before against 22.7 / 24.3 / 24.8 ms after, with every round after above every round before. The bytes are the same; the cost is two more module resolutions, about 0.85 ms each. The unplugged path does not move, because the `sh` gate never starts Node.

## The hook on a file past the byte limit

A 300 MB text file in a plugged project, 3 runs per arm, peak resident memory from `/usr/bin/time -f %M` with the process spawn included. Reading it whole to count its lines cost 371 MB and 0.23–0.38 s; deciding from `statSync` and reading 8 KB to tell text from binary costs 73 MB and 0.04–0.05 s. The decision is the same `deny` either way.

The per-`Read` cost of an ordinary file did not move: 1.7–1.9 ms unplugged and 21.5–22.4 ms plugged, against 1.9 ms and 22.2 ms before, two rounds of 30 runs per arm on the same machine.

## One-shot worker vs a subagent

For the same read: 4–8 s and 0.03–0.07 $ for the one-shot worker, against 26–169 s and up to 0.14 $ for a subagent.

## The Haiku fallback on one 8,230-token call

This README with line numbers, Claude Code 2.1.274, subscription login, one run per arm: 0.0257 $ → 0.0128 $ once the fallback stopped asking for a session title, a second hidden request that carried the whole file again, and wrote a 5-minute cache instead of a 1-hour one. A follow-up question on the same file read 0 tokens from that cache either way.

## The citation check in bulk-read

One free model, files up to 493 lines, 183 citations in 18 answers: 175 matched their line and 8 were tagged, in 3 of the answers. The 8 are the same 2 mis-copied words, and 6 citations that end in the line number again, `path:69:70`, with no text to compare (all in one answer).

The check reads the shapes the worker writes as well as the one it asks for: an invented column (`path:69:1:text`), a dangling ` @ `, and the citation written twice. Before it did, 142 matched and 41 were tagged in 7 answers, 39 of them false alarms where the line was right and its shape was not; Claude now receives 15,106 bytes of the 18 answers where it received 15,535. The 4 answers that locate matched 97 of 97, before and after.

Re-read over the 72 saved answers of all 4 wordings, 1,193 citations: the tags fall from 175 to 77, and each of the 1,116 citations the check accepts quotes the line it resolves to, with none moved off its line and none lost.

Confirmed live the same day on 6 fresh answers, the 6 questions that had carried every tag: 40 citations, 40 matched and 0 tagged, where the check as it stood tagged 9 of those same 40 — that time the worker wrote the column as `path:69:7: text`. The literal reading is tried first, so a line that itself opens with `20:` is not read as a column. A false alarm costs a ranged `Read`, never a wrong line.

The earlier wording, `grep -n`, is tagged 20 times of 278 in 3 of 18 answers (38 in 6 before); its first sample, on other files, had matched 268 of 269. In that first sample, asking for the evidence changed what the worker wrote: over 7 questions Claude received 0.7–2.5× the unchecked answer (3 shrank, 4 grew), and the worker itself wrote up to 3.2× more, which took the slowest call from 12 s to 19 s.

## The citation check with the Haiku fallback as the reader

Claude Code 2.1.274; this README, `src/hook.ts` and `src/state.ts`, one file and one question per call, 5 calls per file per wording.

The instruction used to say "the way `grep -n` prints it", and for one file that is `line:text`: 10 of 15 answers carried no citation the check could read, and 58 cited lines reached Claude whole and unchecked. With `grep -Hn` and "the path first even when there is one file", 1 of 15 carried none (it cited `path:line` and no text), 0 citations arrived without their path, 147 matched, 1 was renumbered, 6 were tagged, and Claude received 8,949 bytes where it had received 13,551.

## The hook's token estimate vs a real Read

Fable 5.1, 9 batches in 2 sessions, line numbers included. The real cost of a whole-file `Read` measured 1.9–2.2× the bytes/4 estimate on batches of 16–27 KB, and 2.1–2.8× on batches of small files: the 8,000-token limit lets through reads of about 16,000 real tokens. A denied `Read` costs 136–251 tokens.
