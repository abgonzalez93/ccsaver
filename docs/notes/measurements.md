# Measurements

The notes behind [Honest limits](../../README.md#honest-limits). Measured on one TypeScript monorepo with Claude Code 2.1, small samples (1–4 sessions per cell). Every number carries its sample size; treat them as a starting point and [measure your own](development.md#measure-it-yourself). What ccsaver's own machinery costs, the hook, the handoff, the launcher, the fallback's start-up, the log and the tests, is on [the development page](development.md).

## The hook on a locate-or-describe task

−16 % session cost, 0.58 $ against 0.69 $ unplugged. Replicated twice more: 0.60 $ and 0.56 $ against 0.72 $ and 0.66 $.

## The hook on a judgement question

No saving and 3.6× slower, 230 s against 64 s. The model pages through ranges and delegates on top of that, so it pays for both. The diagnosis is the limit, not the approach: the file was under the size where delegating pays, so denying it bought nothing. [Limits](../configuration.md#limits) is the knob, and `plug` now measures what it should be.

## Rewriting a denied read into its first lines

An adapter with `rewrite` answers a whole-file `Read` the hook would deny with lines 1 to `maxLines` and a note that names the length of the file. Measured on 2026-09-24 on a 520-line file with 20 exports, `claude -p` with Read, Grep and Glob, the two arms alternated on the same question, the hook wired as a settings hook of an unplugged project. Haiku 4.5, 3 runs per arm: a locate question, what the file exports, 9.5 s and 0.016 $ denied against 11.6 s and 0.035 $ rewritten, 2.2× the cost, because the denial is what sends the model to Grep; a judgement question, whether the pattern is consistent and what to flag, 21.4 s and 0.035 $ against 19.2 s and 0.038 $, inside a 7 s spread. Fable 5.1, 5 runs per arm: on the locate question the hook never fired in either arm, 0 whole-file reads in 10 runs, because Fable greps first and reads by ranges, so the two arms are one condition, 21.5 s and 0.176 $ against 19.5 s and 0.146 $; on the judgement question it fired in all 10, and rewriting saved nothing: 102.3 s (73.7–193.4, median 79.7) and 0.696 $ (0.509–1.066) denied against 101.2 s (90.0–121.3, median 99.1) and 0.710 $ (0.563–0.826) rewritten, 8.4 against 10.2 turns and 3 against 2 `Read` calls, the model reading the 170 lines past the cut by a ranged read either way. The turn a denial costs is paid back by the turns the model spends on 350 lines it did not choose, so `rewrite` is off unless an adapter says otherwise.

## What a repository asks for

What `ccsaver plug` reports, one walk each. This repository: 67 of 67 files, 19 in 20 under 285 lines and 3,237 tokens, which the defaults already fit. One TypeScript application monorepo with no line rule of its own: 334 of 933 files, under 396 lines and 4,907 tokens, which asks for `maxLines` 400. The published sources of `@types/node` and `undici-types`, as a stand-in for library code: 75 files, under 2,835 lines and 33,595 tokens, which asks for 2,850 and 34,000.

Three corpora, a 10× spread in what they ask for, and the defaults are right for exactly one of them. That is why the number is measured per project instead of chosen once.

## Delegated writing of a test file

A ~110-line test file came out break-even: 0.80–1.02 $ delegated against 0.85 $ written directly. The cost is the review, not the writing.


A second call on 2026-09-23, one of the two of a live check: a 15-line test file whose spec named its import as `../src/state/config.store.ts` came back with the reference's path, `../../src/…`, so the file did not load, and passed 3 of 3 once that one import was fixed; the formatter had run and the `warn:` line stayed silent. n = 1, and the skill's warning to name the module of every import stands.

## Where delegation starts to pay

Roughly 2,000–3,000 lines and up.

## The rules of an adapter

`gemini-flash-lite-latest` through an OpenAI-compatible endpoint, ccsaver 0.9.14, four `code-write` runs per arm with the same spec and the same two reference files: `src/state/state.store.ts`, which exports the function asked for, and a test file that imports from a different module with the real extension. The only difference between the arms is whether the plugged project points at an adapter carrying the `rules` of [`adapters/strict-ts.json`](../../adapters/strict-ts.json).

- A return type on the `test` callback: **3 of 4 with the rules, 0 of 4 without**, where the four without copied the reference.
- Importing the function from the module that exports it, with the real extension: **4 of 4 in both arms**, with the spec not naming the module and the reference importing from another one.

So the rules reach the worker and change what it writes. They do not make it match this repository better: the rule says *every function is an arrow const with an explicit return type*, a `test` callback is neither, and this repository's own tests write `() =>` there with the lint green.

The line this note replaces credited the rules with that import instead, 4 of 4 against 0 of 4. It was written with the first commit, its conditions were never recorded, and it does not reproduce against this worker.

## The fixed cost of the skill descriptions

Seven entries, two skills and five slash commands, 983 bytes of descriptions in the skill listing every session loads: 266 tokens, in every project, plugged or not, measured as the difference in input tokens of one `claude -p` prompt with and without the listing's text appended (32,229 against 32,495, on Haiku, one tokenizer for the family); ≈ 0.003 $ a session at a frontier model's input rate. In print mode the listing carries the names only: 28 to 38 tokens by the same method, three runs per arm with the plugin enabled and disabled. Read from cache on every request after the first, it came to 2.47 M cache-read tokens over 83 sessions and 9,291 requests in six days of one machine. The 188 given here before was the two skill descriptions alone, measured in a session.

## Where the handoff limit comes from

175 session transcripts of one machine, all from the VS Code extension, Claude Code 2.1.220 to 2.1.280, read on 2026-09-23 by a script that prints numbers and nothing else; 85 of them are working sessions of 20 requests or more, the rest probes. Context is the status line's sum over the last response of each request.

- Where sessions end: p50 104k tokens, p75 268k, p90 495k, p95 847k, max 1,000k. Of the working sessions, 76 % pass 200k, 42 % pass 300k and 32 % pass 400k. Twelve compactions in nine sessions were automatic, at 967k–1,006k, and one manual, at 519k: nobody compacts at 200k.
- Growth: 1,697 tokens per request at the median (p90 6,978), 8,509 per turn (p90 86,978, p99 321,949), 12.3 requests per turn. One turn in ten grows by more than 87,000 tokens, which is what a warning given at the end of the turn can be late by.
- After crossing 200k a session makes 46 more requests at the median (p90 268), each carrying the whole history. Had those run in a new session opened with a 10,000-token handoff over the project's own base (39k–46k tokens for a first request), the input they carried would have been 31 % smaller; 44 % at 300k and 54 % at 400k, limits that reach fewer sessions. The estimate assumes the new session grows as the old one did and re-reads nothing, so it is a ceiling.
- A real handoff costs 6.6k–14.5k tokens to read: six hand-written ones of 15–28 KB, measured as the difference in context around their `Read`, 2.2 bytes per token with line numbers.
- Effective rates fitted on the cost lines of 15 Opus 5 sessions, residual 0.0 %: 5 $/M input, 25 $/M output, 0.50 $/M cache read, 10 $/M cache write, with no premium past 200k in sessions that reached 966k. At those rates the median session that crosses 200k would have spent 3.5 $ less.

## Where the handoff margin comes from

226 session transcripts of one machine, Claude Code 2.1.220 to 2.1.282, read on 2026-09-25 by a script that prints numbers and nothing else (`ccsaver-relevo-techo-2026-09-25.mjs`, kept beside the reports of the owner's machine, with its output); 99 of them are working sessions of 20 requests or more, 12,273 requests in all, 7,352 of them on Fable 5.1. The count is the one the hook reads, the three input sums of the last response plus its output.

- **The step**, what the count grows by between two consecutive requests, is a response plus one batch of tool results: median 1,770 tokens, p90 7,640, p99 27,712, max 217,607. The ten biggest are batches of 10 to 29 parallel calls, 185,000 to 466,000 characters of results in one step; by batch size, a single call ends at p99 10,500 and max 78,000 (one `Skill`), two to four calls at p99 27,000 and max 91,000, five to nine at p99 49,000 and max 117,000, ten or more (61 steps) at p99 131,000 and max 216,000. That is why the hook cuts a batch near the point, 8,000 tokens per call, instead of adding the whole batch to the margin.
- **One response**, thinking included: median 914 tokens on Fable 5.1, p90 4,900, p99 17,400, max 63,229, none of 12,273 cut by `max_tokens`; Claude Code caps it at 128,000 on that model, so the theoretical step, 128,000 plus one 30,000-character `Bash` result, does not fit under a 200,000 limit with the 44,000 tokens a first request already carries, and a batch has no documented cap at all. The margin is measured, not theoretical.
- **Writing the handoff** cost 7,104 to 11,796 tokens in the four turns of `/ccsaver:handoff` that took three requests or fewer, a handoff of 9,900 to 15,200 characters each; with the request the hook adds, about 600 tokens, 15,000 is the figure the margin carries.
- **The overflow at the point**, what the count reached past 120,000 on the request that first crossed it, with a batch cut at 8,000 per call: max 53,000 in 104 crossings, none past 60,000, two past 40,000, p99 38,000, p90 14,000. Plus the handoff, 68,000 at most: under the 80,000 margin in every session measured. Without the cut, the max was 100,000, three past 60,000.
- **The price**: 91 of the 99 working sessions cross 120,000 (78 cross 200,000); between 120,000 and 200,000 a session makes 17 requests at the median (p90 37), 2,008 requests in all, 16 % of every request measured, which now run in a new session opened with the handoff; the cut touches 18 % of the parallel batches from a median count of 103,000 on, in 52 of the 99 sessions, 213 of 1,405 calls held to be called again. A margin of 60,000 (point 140,000) would have covered 99 of 102 crossings for 15 requests at the median; 100,000 without the cut (point 100,000), all of 104 for 20 requests at the median, but a batch like the 142,000-token one of 2026-09-24 at 99,000 would have ended at 241,000.
- **The transcript lags the conversation**: at `Stop`, 10 of 11 warnings of the previous hook read the request before the last one of the turn; in one session the final line carried a time 114 ms before the hook ran and was not there, in another 156 ms and it was. That is what the hook waits for.

200,000 is the default because that is where three working sessions in four still have 46 requests ahead of them, and because it is the count the author was already applying by hand.

## One-shot worker vs a subagent

For the same read: 4–8 s and 0.03–0.07 $ for the one-shot worker, against 26–169 s and up to 0.14 $ for a subagent. The worker's side has since fallen: with `gemini-flash-lite-latest` on 2026-09-24 a real `bulk-read` took 1.03 / 1.15 / 1.12 s of wall clock for a 100-line file, 968 / 1,093 / 1,060 ms of it at the endpoint, and 1.37 s, 1,313 ms, for 150 KB, nine calls in all. DNS, TCP and TLS are 55–90 ms of that, and there is no streaming, so the first byte is the whole answer; the 30 s the call waits are six times the worst normal case, 2,048 tokens at about 435 a second.

## An answer cut at the output limit

Six days of one machine's log, 2026-09-19 to 24: 23 delegations, one of them back with `finish_reason: length` after 25,237 ms, the fallback off, so a 33 KB file was sent for nothing. Five probes with a 100-line file on 2026-09-24: four answered in 73–107 tokens and 982–1,198 ms, one in 2,044 tokens and 4,794 ms, cut at the 2,048 the call asks for, because the model started writing and did not stop; the worker charges the 2,044 all the same. So `bulk-read` keeps a cut answer, with a note, and `code-write` still falls back: the first is bullets, each checked against the file, and the second is a file that has to be whole.

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

`saved` prints the first count at the foot, from the `context` the hook records on every line and the session's own ranged reads that follow a denial of the same file in the same session ([saved](../events.md#saved)). It cannot see the `sed` and `cat` follow-ups, 7 of the 13 here, so it undercounts; two ranged reads made in one request count that request twice, so it overcounts; and no column holds the second count.

## The hook's token estimate vs a real Read

Fable 5.1, 9 batches in 2 sessions, line numbers included. The real cost of a whole-file `Read` measured 1.9–2.2× the bytes/4 estimate on batches of 16–27 KB, and 2.1–2.8× on batches of small files: the 8,000-token limit lets through reads of about 16,000 real tokens. A denied `Read` cost 136–251 tokens with the 376-character message; the 254-character one has not been measured in a session.

