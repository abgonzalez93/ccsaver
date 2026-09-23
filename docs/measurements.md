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

`gemini-flash-lite-latest` through an OpenAI-compatible endpoint, ccsaver 0.9.14, four `code-write` runs per arm with the same spec and the same two reference files: `src/state/state.store.ts`, which exports the function asked for, and a test file that imports from a different module with the real extension. The only difference between the arms is whether the plugged project points at an adapter carrying the `rules` of [`adapters/strict-ts.json`](../adapters/strict-ts.json).

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

That 24 ms was 22 ms while the state folder, the log and the configuration lived in one module. Splitting them into `state.store.ts`, `log.store.ts` and `config.store.ts` costs **1.7 ms per `Read`**, measured paired on the same machine, three rounds of 30 runs per arm: 22.4 / 22.1 / 21.9 ms before against 22.7 / 24.3 / 24.8 ms after, with every round after above every round before. The bytes are the same; the cost is two more module resolutions, about 0.85 ms each. The unplugged path does not move, because the `sh` gate never starts Node.

Moving `worker.json` out of `config.store.ts` into `worker.store.ts` costs the hook nothing, because the hook never imported those 77 lines and gains no module: 30.1 / 30.4 ms whole against 31.4 / 30.0 ms split, two rounds of 30 runs per arm, paired, on a machine whose own floor for the harness is 4.2 ms. The two arms sit inside each other's spread, so the split is free, not faster — the only thing that moves a hook import list is a hook import.

The launcher taking the name of the hook it starts, so that a second hook shares it instead of copying it, costs nothing either: 26.2 / 25.8 / 24.8 ms before against 26.4 / 25.9 / 25.1 ms after in a plugged project, and 1.8 against 1.7–1.8 ms unplugged, three rounds of 30 runs per arm, paired.

Folders cost it nothing either. When `src/` regrouped by feature and the hook's three imports moved into `src/state/`: 21.3 / 20.6 / 21.0 ms flat against 21.4 / 20.6 / 20.4 ms in folders, three rounds of 30 runs per arm, paired, both trees on the same disk. A first pair with the flat copy on `tmpfs` read 2 ms in favour of the folders, which was the disk and not the layout: what the hook pays for is a module, never the depth of its path.

## The handoff hook per turn

Three rounds of 30 runs per arm, paired, process spawn included, on a 4 MB transcript whose last line holds the count, with the warning already given for the multiple the count sits in, which is what every turn but the crossing one costs: **1.7 / 1.7 / 1.7 ms in an unplugged project and 1.7 / 1.7 / 1.7 ms in a plugged one with the warning off**, where `hooks/gate` exits in `sh` before Node starts, and **27.2 / 27.3 / 25.9 ms with it on**: Node's start-up with four modules, the last 256 KB of the transcript parsed, and the marker read. The `Read` gate did not move when the switch line joined the launcher: 24.3 / 23.9 / 24.3 ms before against 24.0 / 24.0 / 23.7 ms after.

The fifth slash command's description is 86 characters, about 22 tokens by bytes/4 on the listing every session loads, beside the ~188 the two skill descriptions measured; it has not been measured in a session of its own.

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

## The hook on a file past the byte limit

A 300 MB text file in a plugged project, 3 runs per arm, peak resident memory from `/usr/bin/time -f %M` with the process spawn included. Reading it whole to count its lines cost 371 MB and 0.23–0.38 s; deciding from `statSync` and reading 8 KB to tell text from binary costs 73 MB and 0.04–0.05 s. The decision is the same `deny` either way.

The per-`Read` cost of an ordinary file did not move: 1.7–1.9 ms unplugged and 21.5–22.4 ms plugged, against 1.9 ms and 22.2 ms before, two rounds of 30 runs per arm on the same machine.

## One-shot worker vs a subagent

For the same read: 4–8 s and 0.03–0.07 $ for the one-shot worker, against 26–169 s and up to 0.14 $ for a subagent.

## The Haiku fallback on one 8,230-token call

This README with line numbers, Claude Code 2.1.274, subscription login, one run per arm: 0.0257 $ → 0.0128 $ once the fallback stopped asking for a session title, a second hidden request that carried the whole file again, and wrote a 5-minute cache instead of a 1-hour one. A follow-up question on the same file read 0 tokens from that cache either way.

## Adding up a month of the log

A synthetic month of 200,000 `gate` lines, 66.6 MB, added up by `ccsaver saved 2026-08`: **0.39-0.44 s and 219 MB of peak RSS**, against 0.59 s and 317 MB while the reader built an array of every row of the month first. The fold holds one row at a time, so what is left is the month's own text, read whole with `readFileSync`.

Reading it as a stream instead takes the same work to 0.31 s and 80 MB, but it makes the reader asynchronous, and `src/` reads files synchronously for the reason 4.1 of [CONTRIBUTING](../CONTRIBUTING.md) gives. At the 181 denied reads a month of the worked example, 66.6 MB is about 900 years of log, so the ceiling is written down here rather than paid for.

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

The denial message the hook writes is 376 characters for a path of 44, so ~94 tokens at chars/4: 330 of them are the fixed text and the rest is the path and the three numbers. The session reads one per denied `Read`, and it reads the worker's answer back on every delegation, which the event log records as `answerChars`. `ccsaver saved` adds both up at the foot of the report and puts neither in a column, because nothing in the log says which model was running when the answer came back.

## The hook's token estimate vs a real Read

Fable 5.1, 9 batches in 2 sessions, line numbers included. The real cost of a whole-file `Read` measured 1.9–2.2× the bytes/4 estimate on batches of 16–27 KB, and 2.1–2.8× on batches of small files: the 8,000-token limit lets through reads of about 16,000 real tokens. A denied `Read` costs 136–251 tokens.
