# Changelog

Every commit is a version. A git hook writes each section from the commit message, its subject and the bullets of its body ([how](docs/versions.md)), and the numbers follow [Semantic Versioning](https://semver.org/).

Every version is here, back to the first commit, newest first. Nothing falls off the bottom, so this file has no ceiling: read it from the top, or search it. Nothing before 0.2.0 was numbered one by one, because the hook did not exist yet, so the last section is a single 0.1.0 holding the seventeen commits that make it up.

## 0.25.2 - 2026-09-24

docs: the fixed cost is seven entries and 266 tokens, and a Bash read leaves no trace in the log

- the listing carries two skills and five slash commands, 983 bytes, measured at 266 tokens by the difference in input tokens of one `claude -p` prompt with and without it; the README said 188 for the two skills alone
- the README no longer says the log counts a `cat`: a ranged Read is counted, a Bash read never is, and in the `auto` permission mode the harness tells the model to read with `cat`, `head` and `sed`, so there most reads never meet the gate; the note holds the session that read 1,113 lines that way and left the log empty

## 0.25.1 - 2026-09-24

fix: the gate never denies a file that bulk-read would refuse to send

- a whole-file Read over the limits of a secrets file by name or place, of a file holding a private-key header at the start of a line or an access token, or of a binary its first 8 KB did not reveal, is let through with the reason `untakeable`: a denial nothing can delegate only costs, and one measured on the 23rd drew three requests at 283,000 tokens of context for a CHANGELOG.md that never arrived
- the hook asks the guard the delegation asks, `pathRefusal` and `contentRefusal` of boundary.guard.ts, so the two can never disagree; the import list the conventions test pins and CONTRIBUTING 2.1 and 4.4 carry the fourth file
- a file past the byte limit that is about to be denied is read once for the check, up to 1 MB; past that it is denied unread, as before
- measured paired, three rounds of 30 runs, log on: the allow path does not move, the deny path pays about half a millisecond

## 0.25.0 - 2026-09-24

feat: the gate records the context beside the model, and saved counts the denials that ranged reads followed

- every gate line carries `context`, the input, cache-creation and cache-read tokens of the session's last request, from the transcript line the model already came from; null under the same conditions as the model
- `saved` keeps, per denial inside the root, the ranged reads of the same file that followed it in the same session, and prints at the foot how many denials were followed, how many reads that was, and the context their requests re-read, in neither column
- six days of transcripts measured 37 denials, and 8 follow-up requests inside the root that re-read 1.57 M tokens of context, 969 k of them on one CHANGELOG.md no skill could take: the note is in measurements.md and the row in the README's honest limits
- the `saved` section moves from configuration.md, which sat 49 bytes under the 32 KB gate, to the end of events.md, the page it adds up
- the hook does not move: 28.1 / 27.5 / 28.0 ms before against 27.9 / 29.5 / 27.0 ms after, three rounds of 30 runs, paired, log on

## 0.24.19 - 2026-09-23

test: the version-hook tests remove the repositories and patch folders they make

- each run left about fifty ccsaver-version-* and ccsaver-patches-* folders under /tmp, a thousand after a day of gates

## 0.24.18 - 2026-09-23

docs: the skill's grant does not apply when Claude invokes the skill, and the Skill rule that pre-approves the invocation

- measured on 2.1.280 in print mode with the user's rules removed: the Skill invocation itself is refused without a rule, and with Skill(ccsaver:bulk-reader) allowed the command the skill hands over still asks for approval; a probe skill granting Bash(node -e *) is refused the same way, while echo and grep run because Claude Code approves them on its own
- the README now says which rules to add, for interactive and for print-mode sessions

## 0.24.17 - 2026-09-23

docs: what the log cannot say, hard links, the skill's grant, the adapter limits event, and what a citation proves

- events.md lists the adapter limits config event it never named, and ends with what the log does not record: work against development, what followed a denial, which doctor check failed, the settings made before log on, and calls killed or logged while the log was off
- the README says a hard link is judged as the inside file it is, and quotes Claude Code's documentation on the skill's grant beside what 2.1.274 was seen to do
- the bulk-reader skill says a citation proves the line, not the claim, and that "is X there?" belongs to Grep
- measurements.md keeps the second code-write data point: an import copied from the reference against the spec, n = 1

## 0.24.16 - 2026-09-23

fix: saved prints a count of tokens under ten thousand as a number, not as 0.00 M

- one external call of 155 tokens and 1,088 tokens read back both printed as 0.00 M, which reads as nothing

## 0.24.15 - 2026-09-23

fix: the gate reads the last 256 KB of the transcript for the model, and records none for a subagent

- 49 of the 192 gate lines written since the model was recorded carried null, because a single tool result of 65 to 108 KB pushed the last assistant line out of the 64 KB tail the hook read; 256 KB is what the handoff hook already reads, and the cost is inside the noise of the harness
- a Read made by a subagent recorded the model of the session, never Sonnet or Haiku, because the transcript Claude Code hands the hook is the session's; the line now says null, so saved leaves those reads unpriced instead of pricing them at the session's rate
- the tests of what the gate records as the model move to test/gate/model.test.ts, which keeps events.test.ts under the gate

## 0.24.14 - 2026-09-23

fix: saved leaves a denial of a file outside the plugged project out of the without column

- 83 % of the tokens September's report counted as saved came from six denials of files outside the root, which the subagents then read whole through Bash; the gate no longer denies those, and the report leaves the ones older logs hold out of the sum and says so at the foot

## 0.24.13 - 2026-09-23

fix: the gate never denies a file outside the plugged project, and the log says outside

- six of the ten real denials of September were subagents reading Claude Code's own tool-results files outside the root; the denial pointed at bulk-reader, which cannot take a file outside the root while the fallback is off and sends it to paid Claude Haiku when it is on, and the subagents read the file whole through Bash instead
- a whole-file read outside the root is now allowed with the reason outside, which saved will leave out of its without column
- doctor writes its throwaway probe file inside the root for a moment, since one outside it would no longer be denied, and warns instead of failing when it cannot write there

## 0.24.12 - 2026-09-23

fix: every log line says which version of ccsaver wrote it

- a month's file mixes what seventeen versions and a few unpublished builds wrote, and three lines of September only made sense next to the git history: a ranged read with counted lines past the byte cap, a denial by tokens with lines counted, a gate line carrying raw hook fields
- the by field comes from package.json, read once per process, in the Node writer and in the key set line the launcher writes in shell

## 0.24.11 - 2026-09-23

fix: doctor reads a 400 from the worker as a rejected key or request

- Google's OpenAI endpoint answers 400, not 401, to a key it does not know, and the probe reported it as the model answering 400 in so many milliseconds

## 0.24.10 - 2026-09-23

fix: the formatter runs with a bare environment, and what it prints stays out of the log

- the formatter inherited the whole environment of the session, fifteen CLAUDE variables and a messaging token among them, for a tool that needs PATH and HOME
- the note about a failing formatter recorded up to 400 characters of its stderr, which biome fills with the lines of the generated file; the session still sees them, the log keeps the exit code and the target only
- the fake formatter of the tests takes its orders from a file beside it, since the environment no longer carries them

## 0.24.9 - 2026-09-23

fix: a worker moved to another host sets the stored key aside until key set stores the new one

- worker set to a different host warned that the stored key stayed, and the next call sent the key of the old provider to the new one; the key is now renamed to api-key.moved, every call fails with one line and sends nothing anywhere, doctor fails its key: line the same way, and key set removes the file it set aside
- the same host, a changed model, or no stored key leave things as they were
- shown, how a url is displayed, moves from worker.client to state.store beside the other display helpers, which keeps worker.client under the gate

## 0.24.8 - 2026-09-23

fix: the notes name a redirect, say when the fallback is off, and say why a call with no worker falls back

- a refused redirect was reported as the host being unreachable; it is now its own reason, redirect, in the note, the log and doctor
- every note said "falling back" even when the fallback was off and the next line said so; it now says "and the fallback is off"
- a call with no worker.json went to paid Claude Haiku with no line saying why, against what the events page promises
- a usage block reporting negative prompt tokens was recorded and summed by saved; it is now ignored like a missing one

## 0.24.7 - 2026-09-23

fix: bulk-read asks for 2,048 tokens of answer, and a body past 4 MB is no answer

- the answer of a bulk-read was capped at 8,192 tokens, about 32 KB, and the Bash tool of Claude Code shows about 30 KB inline: a long answer landed in a file the gate then denied, so the delegation lost its point exactly when the worker rambled; a question that needs more than 2,048 tokens of bullets is Grep's job
- code-write keeps 8,192, because a generated file can be long and with --target it never enters the context
- the body of the worker's response is read with a 4 MB ceiling, so an endpoint that ignores max_tokens cannot fill the memory; past it the call counts as incomplete

## 0.24.6 - 2026-09-23

fix: the fallback switch is read again at the moment of falling, not only when the call starts

- worker.json was read once at the start of a call, so a fallback off typed while the worker was still answering did not stop that call from going to paid Claude Haiku when the worker then failed
- the fake server of the tests can now delay its answer, which is what a switch flipped mid-call needs

## 0.24.5 - 2026-09-23

fix: the stored key is hidden in everything a command prints, as it already was in the log

- a worker that echoed the Authorization header, or a file that carried the key in a shape the net does not know, put the key on stdout and so into the session's context and transcript; the log alone replaced it with [key]
- one function in state.store now hides it for the log, the framed answer, the notes, the errors and the lines code-write prints

## 0.24.4 - 2026-09-23

fix: the warn line names require( and a bracket access to process

- a generated test that loaded fs or child_process through require, or read process["env"], tripped nothing: the list knew import( and process.env only

## 0.24.3 - 2026-09-23

fix: code-write refuses a target under .github/workflows or .githooks

- a workflow written by the cheap model runs in CI on the next push, and this repository runs the hooks of .githooks on every commit; both folders took a --target
- the rest of .github stays writable, because dependabot.yml and the templates run nothing, and the boundary test that pinned ci.yml as a valid target now pins the opposite

## 0.24.2 - 2026-09-23

fix: a private-key header is refused only at the start of a line

- the pattern matched a mention inside prose, so CHANGELOG.md, whose entry describes the header, could never be delegated: the gate denied its whole-file Read and the bulk-reader skill then refused it
- a PEM or PGP block always opens at column 0, so anchoring the marker loses nothing

## 0.24.1 - 2026-09-23

refactor: the launcher a terminal runs is two files under launcher/, put together when it is written

- launcher/ccsaver.sh is the shell and launcher/installed.js the reader of installed_plugins.json it carries inline, each in its own language and lintable, and the JavaScript piece runs on its own too
- src/doctor/launcher.service.ts inlines the second into the first at its placeholder, so the file that lands in ~/.local/bin stays one self-contained script
- the conventions guard reads every line again, template literals included, because the shell no longer lives in a TypeScript string
- the tests of the terminal launcher move next to the service they exercise, test/doctor/terminal-launcher.test.ts, and test/cli/launcher.test.ts keeps those of bin/ccsaver

## 0.24.0 - 2026-09-23

feat: doctor checks the launcher of your own terminal, which version it runs and whether its folder is on the PATH

- launcher: ok when ~/.local/bin/ccsaver is ccsaver's and, run with the session's plugin bins off the PATH, answers this doctor's version; warn when there is none or when it is an older launcher of ccsaver's, both with the fix ccsaver launcher write that doctor offers on a terminal, when it is someone else's, which is left alone, or when it runs another version; FAIL with the launcher's own Error line
- path: whether ~/.local/bin is on this PATH, with the profile line to add when it is not, and a ccsaver of someone else's that comes first on the PATH is named
- the two lines come after the projects, so the fixes doctor offers keep their order
- the doctor tally test compares the counts with the lines instead of demanding zero warn

## 0.23.0 - 2026-09-23

feat: ccsaver launcher write puts a launcher for your own terminal in ~/.local/bin, and setup runs it

- Claude Code puts a plugin's bin/ on the PATH of its own Bash tool only, and nothing of a plugin's runs at install, so a terminal answered command not found until a launcher was typed by hand from the configuration page
- the launcher reads the installed version from installed_plugins.json, under CLAUDE_CONFIG_DIR or ~/.claude, and runs that one: never the newest folder in the cache, which the hand-written script ran even after plugin uninstall; a record it does not know stops it with the file's name, never read as not installed
- inside a session it hands over to the bin/ the session loaded, at 1.6 ms; a terminal pays 16 ms for the record, measured in docs/measurements.md
- it is created with wx, never over a ccsaver it did not write, and replaces only an older launcher of its own; a folder off the PATH prints the one profile line to add, and a ccsaver of someone else's ahead on the PATH is named
- pnpm test starts from a HOME that does not exist, so a test that forgets its own cannot touch a real launcher
- the conventions guard blanks template literals before it reads a line, because a string is not code

## 0.22.0 - 2026-09-23

feat: ccsaver warns when a session's context passes a limit, and keeps the handoff for the next one

- a Stop hook, src/handoff.hook.ts, reads the last 256 KB of the session transcript for the token count of the last response, input plus cache creation plus cache read, the sum the status line shows, and once per multiple of the limit ends the turn with a systemMessage naming the model, the count and the limit; a marker per session in handoff/<session>.tier remembers the multiple, falls back after a compaction, and markers older than seven days are swept
- ccsaver handoff on|off|<tokens>: the switch and the limit live in handoff.json, absent means on at 200,000 tokens; a malformed or unreadable file stops the command with its name and leaves the hook silent with a crash event; typed with the value in force it answers already; ccsaver handoff alone shows what is set and what is kept
- off costs what an unplugged project costs, because hooks/gate reads the switch in sh before Node starts
- /ccsaver:handoff has the session write the handoff, eight parts for a reader who never saw the conversation, and ccsaver handoff write keeps it from stdin in handoff/<session>.md at 600, refuses one past 350 lines or 32,000 bytes, and prints the line that opens the next session with it
- doctor reports the switch and the limit, and the modes of handoff.json and handoff/ once they exist; the log gains a handoff event, warned and written, and a config action
- the limit comes from 175 transcripts: 76 % of working sessions pass 200,000 tokens and make 46 more requests after it; the hook costs 1.7 ms per turn unplugged or off and 26-27 ms on, and the Read gate did not move

## 0.21.5 - 2026-09-23

refactor: one launcher starts either hook, and the transcript reader lives in config.store

- hooks/read-gate is now hooks/gate <name>: the same sh gate leaves an unplugged project before Node starts, then execs src/<name>.hook.ts, so a second hook shares it instead of copying it
- hooks.json and doctor call it as gate read-gate, and test/repo/skills.test.ts checks that the name a launcher is given is a hook file that exists
- lastAssistantOf in src/state/config.store.ts reads the last main-chain assistant line of a transcript tail, its model and the tokens in its context, skipping a subagent's line and a synthetic one; the gate takes the model it records from it
- measured paired, three rounds of 30 runs per arm: 26.2 / 25.8 / 24.8 ms before against 26.4 / 25.9 / 25.1 ms after in a plugged project, 1.8 against 1.7-1.8 ms unplugged

## 0.21.4 - 2026-09-23

refactor: every file is name.role.ts, and every name below the root is kebab-case

- 18 TypeScript files renamed to noun.role.ts, the launchers and NOTICE follow
- CONTRIBUTING 2.6 lists the eleven roles, CLAUDE.md carries the law
- the conventions test guards kebab-case below the root and the role of every .ts

## 0.21.3 - 2026-09-23

test: test/ regroups by feature, and the conventions test guards the six-file rule

- eight folders, each named after what it exercises: gate, delegation, boundary, state, cli, saved, doctor and repo; helpers.ts stays at the top, where every test finds it
- pnpm test walks test/**/*.test.ts
- no directory but the root reaches six files, by test/repo/conventions.test.ts, and the guard line of 2.5 names it
- every guard CONTRIBUTING and the development page name follows its test

## 0.21.2 - 2026-09-23

refactor: src/ regroups by feature, in state, delegation, saved and doctor

- the sixth-file rule of CONTRIBUTING 2.5: the three files of the state folder in src/state/, the two flows with their ways out and what may leave in src/delegation/, the report and its prices in src/saved/, the checks and the survey in src/doctor/; cli.ts and hook.ts stay at the top, where bin/ccsaver and hooks/read-gate find them
- doctor.ts gives birth to finding.ts, what a check reports and how its fix is offered, because the longer import paths wrapped it past 350 lines
- the hook pays nothing for the folders: 21.3 / 20.6 / 21.0 ms flat against 21.4 / 20.6 / 20.4 ms in folders, three rounds of 30 runs per arm on the same disk, in docs/measurements.md
- the map of 2.1, every citation, NOTICE and the tests follow the files; the conventions test pins the hook's imports at their new paths and lets a citation name a folder

## 0.21.1 - 2026-09-23

docs: a directory regroups at its sixth file, not past its fifteenth

- CONTRIBUTING 2.5 said folders earn their place past 15 files or 3,000 lines; the owner's threshold is six files a directory and 350 lines a file, and the rule now says so: the sixth file regroups by feature, and only the root is excused
- CLAUDE.md carries the law beside the one on file size

## 0.21.0 - 2026-09-21

feat: ccsaver runs on the Node 22 line, from 22.18

- the launcher takes 22.18 and newer next to 24.2 and newer, and its FAIL line names both
- engines declares >=22.18 <23 || >=24.2: type stripping and import.meta.main both land in 22.18, and the 23 line, 24.0 and 24.1 leave import.meta.main undefined
- @types/node drops to 22, the major of the oldest Node engines supports
- CI runs 22 next to 24 and 26
- doctor's test refuses 22.17, 23.9 and 24.1, and takes 22.18 and 24.2

## 0.20.15 - 2026-09-21

docs: the configuration page says how ccsaver reaches a terminal of your own

- Claude Code puts the plugin's `bin/` on the `PATH` of its own sessions only, so after an install a shell answers `ccsaver: command not found`, while the README had `ccsaver list` typed in one and the configuration page had `ccsaver setup` run "from a shell"
- docs/configuration.md gains "Your own terminal": the launcher to paste into `~/.local/bin`, why it is a script and not a symlink (the install folder carries the version in its name), and the `~/.profile` that only adds the folder when it was there at login
- the README quickstart names the symptom and links there, Uninstall removes the launcher, and both maps of the pages list the new section

## 0.20.14 - 2026-09-20

test: the too-big read is proved by its message, not by a clock

- the test asserted that the call took under two seconds to show the file was never read; the `Error:` line already proves it, because the read branch says `file not found or unreadable` and the stat branch says `too big to read in one call`, and a clock on a loaded CI runner is the one thing 5.2 does not allow in a test

## 0.20.13 - 2026-09-20

test: the helpers that five files copied live in helpers.ts

- `jsonOf` was written five times, the root check `process.getuid?.() === 0` five, `HAS_PTY` three and `everything` three, letter for letter; each now has one home in `test/helpers.ts`
- the two tests that returned early as root now say `skip: AS_ROOT` like the others, so the runner reports them skipped rather than passed
- no test changed what it checks: 257 before and after

## 0.20.12 - 2026-09-20

refactor: one guard opens the first choice of a worker's answer, and one line prices the worker

- `isCutShort` and `contentOf` each walked `raw.choices[0]` with the same three checks; `firstChoice` is the one place that opens it, and CONTRIBUTING 3.3 cites it
- `listedPrices` and `shownPrices` spelled the same unset/free/rate ternary letter for letter; `rateOf` holds it once
- no behaviour changes: the 257 tests pass as they were

## 0.20.11 - 2026-09-20

docs: the rules name their two exceptions, the line count is today's, and a stray half-sentence leaves versions.md

- CONTRIBUTING 1.6 said `readWorker` was the only reader of `worker.json` while `src/prices.ts` · `workerNamed` has read it on its own since the worker's name joined the price lines; the rule now names that exception and why, and names `src/saved.ts` · `tallied` as the one export only the tests call
- the map row of `prices.ts` owns that lenient read
- 2.5 said about 2,500 lines of `src/`; there are about 2,800, still short of the 3,000 the rule sets for folders
- docs/versions.md had "Turn both on once per clone:" in front of the rules for `feat` and `fix`, a leftover of an edit; the real instruction with its two `git config` lines stays where it was

## 0.20.10 - 2026-09-20

fix: key set with an argument after it prints its usage line instead of reading the key

- the launcher took `ccsaver key set extra` as `key set` and asked for the key, while every other command has refused an argument it does not take since 0.19.9
- the launcher now claims `key set` only when nothing follows it; anything else reaches the CLI, where `key` carries the same `atMost` as its siblings and answers `key takes at most 1 argument, not 2: set extra` over its row of the table
- test/mistakes.test.ts holds the new row

## 0.20.9 - 2026-09-20

fix: doctor passes a state file stricter than 600 and a folder stricter than 700

- `permissions` asked for the exact mode, so a key set to 400, which every writer of the state folder works with because each one writes a `.new` and renames it, was a `FAIL` that told the user to loosen it
- the check now asks what matters: no bit for group or others, and the owner keeps the read bit, or read and search for a folder; a file at 000 still fails, because its owner cannot read it either, and the `ok` line shows the mode it found
- the log keeps its exact check, because the hook appends to its files and 400 would lose events in silence
- docs/configuration.md says so under doctor

## 0.20.8 - 2026-09-20

fix: a file too big to read in one call is named as that before it is opened, not as missing

- `fileBlock` read the whole file and let `readFileSync` fail, so a 600 MB file came back as `file not found or unreadable` (reproduced), after 2 GB of it had been read into memory for nothing: Node reads the bytes first and only then refuses to make them a string
- the `stat` that was already in hand is now weighed against the string limit Node exposes in `node:buffer`, and the call stops before the file is opened, with the size and the limit in the line
- `shapeRefusal` holds the two answers a `stat` can give, not a regular file and too big, beside the `refuse` that prints them

## 0.20.7 - 2026-09-20

fix: a worker.json or a prices.json with a key it does not know is malformed, never read with that key dropped

- `readWorker` kept the keys it knew and ignored the rest, so `"fallbck": false` read as a worker with the switch left out, which is the paid fallback on (reproduced); `adapterOf` has refused an unknown key since the first adapter, and now the other two readers of a state file do the same
- `readPrices` takes `models`, `worker` and the `main` it refuses by name, and nothing else
- docs/configuration.md names the case beside the stray comma and the quoted boolean

## 0.20.6 - 2026-09-20

fix: a formatter named by an absolute path outside the project is not run, and one that fails says what it printed

- `bin !== command && !isUnder(bin, root)` only refused a relative path that climbed out with `..`: for an absolute one `resolve(root, abs)` is `abs`, the first term was false and the formatter ran wherever it pointed (reproduced, it wrote outside the project); now any command with a `/` in it runs only from inside the plugged root, and a bare name is looked up on the PATH as before
- the formatter's stderr was thrown away and the line said `exited 2, check <target>` with no reason; it now carries the first 400 characters of what the formatter wrote, the way `invokeClaude` already names the fallback's
- the spawn carries an explicit `maxBuffer` of 1 MB, as 4.2 asks of every spawn
- docs/configuration.md states the three rules for `format`

## 0.20.5 - 2026-09-20

fix: scrubbed escapes the invisible characters that reorder or hide text, not only the control ones

- `\p{Cc}` let a bidi override (U+202E) or a zero-width space (U+200B) through untouched: neither repaints a terminal, but either makes a worker answer, a path or a `next:` line read differently from what it holds, and the worker controls that text
- the bidi controls, the zero-width characters, the word joiner and the byte-order mark are now written as `\u202E`, the way a control character is written as `\x1b`; an accent, an em dash or an emoji are left alone, which is why the set is named rather than the whole `\p{Cf}`
- `state.ts` is on the hook's import list and gains no module

## 0.20.4 - 2026-09-20

fix: the plug command that plug and doctor propose quotes a root with a space in it

- `fixOf` wrote `ccsaver plug /home/you/My Project my-project`, which pasted would plug `/home/you/My` with the adapter `Project`, and commands/plug.md and commands/doctor.md tell Claude to offer that line
- `quoted` moves from `src/worker.ts` to `src/state.ts`, where `survey.ts` may import it under the map of CONTRIBUTING 2.1, and the root goes through it like a `{target}` in an `after` line does
- doctor's own interactive fix never went through a shell and was right already
- `state.ts` is on the hook's import list and gains no module

## 0.20.3 - 2026-09-20

fix: a plugged list that cannot be read stops plug and unplug instead of being written over

- `readPlugged` read a `plugged` file it could not open as an empty list, and `plug` or `unplug` then wrote that list back with one line, losing every root plugged before (reproduced with chmod 000: two projects gone); `list` said nothing was plugged in
- it now asks `existsSync` before it hands back an empty list, the way `readWorker`, `readPrices`, `textAt` and `findAdapter` already do, and stops with the file's name and "nothing was changed"
- `doctor` turns that into one `FAIL plugged:` line and reports everything else; the hook never reaches it, because `hooks/read-gate` asks `[ -r ]` of the file before Node starts
- `config.ts` is on the hook's import list and gains no module; the new call runs only on the failure path
- CONTRIBUTING 3.4 and the README name the case

## 0.20.2 - 2026-09-20

fix: saved no longer counts a ranged read of a file past the byte limit as the whole file

- the hook never counts the lines of a file over maxTokens·4 (32 KB) and writes `lines: null`; `partOf` read that as "no lines" and returned 1, so every ranged Read of such a file entered `instead` with the tokens of the whole file, and one denial plus five pages of a hundred lines printed a loss in red
- those reads now count in the `instead` line and carry no tokens: `Spend.uncounted` holds how many, and the foot says so, which is the fifth caveat that leans towards flattering ccsaver rather than the other way
- `test/saved.test.ts` pins two such rows beside a counted one, and `test/events.test.ts` feeds `saved` a row the real hook wrote for a ranged read of a 40 KB file, so the shape the writer produces is the shape the reader is tested against
- docs/configuration.md and commands/saved.md name the exception

## 0.20.1 - 2026-09-20

chore: pnpm release pushes main with its tags and refreshes the installed plugin

- `pnpm release` runs `git push --follow-tags`, then `claude plugin marketplace update abgonzalez93` and `claude plugin update ccsaver@abgonzalez93`, the three steps that turn a commit here into the plugin this machine runs
- `--follow-tags` carries the hook's tag whether or not the clone set `push.followTags`, and the push is what makes the release workflow sweep
- docs/development.md names it after the gate

## 0.20.0 - 2026-09-20

feat: a setting typed again says it already is, a mistake says what was wrong, and a terminal sees marks in colour

- a setting typed with the value it already has answers `already` and writes nothing, on disk or in the event log: `log on|off`, `fallback on|off`, `worker set`, `worker claude`, `price`, `adapter`, `plug` on a plugged project and `unplug` on one that is not; every one of them exits 0, because nothing is wrong
- `fallback on` on a worker.json without the switch counts as already on, since on is the default, and leaves the file as it was
- a change that replaced a value names the old one: `plugged <root> · adapter strict-ts (was none)`, `price claude-opus-5 $6/M (was $5/M)`, `fallback binary pinned: <path> (was <path>)`, and `fallback` and `log` say what the switch means beside the word
- a command given arguments it cannot take says what was wrong as the `Error:` line, with its own row of the usage table under it (`usage: ccsaver fallback on|off …`); the exit code stays 1 and the fail event carries the reason; a word that is no command gets `Error: unknown command: <word>` and the whole table
- on a terminal every line opens with a mark in colour, ✓ for a change, → for something already so, ! for a warning, ✗ for an error, and doctor paints its level labels the same way; a pipe, `NO_COLOR` or `TERM=dumb` see plain words, each stream judged on its own; the launcher paints `key set` by the same rule and tells `key stored` from `key replaced`
- doctor ends with its tally after a blank line, `12 checks: 10 ok, 1 warn, 1 FAIL`, which commands/doctor.md now names so it is not read as a check
- `src/state.ts` · `marked` is the one painter, and untrusted text is scrubbed first and painted second, because scrubbed would escape the paint
- the hook imports no new module: 21.8 / 20.2 / 20.2 ms per Read before against 21.7 / 21.4 / 21.6 ms after, three rounds of 30 runs each on the same machine, inside each other's spread
- tests: `test/twice.test.ts` types every setting twice and counts the config events, `test/mistakes.test.ts` holds 25 wrong command lines with the reason and the row each one gets, `test/terminal.test.ts` sees the marks under a pty and none under `NO_COLOR` or `TERM=dumb`

## 0.19.21 - 2026-09-20

test: the edges of the gate, the target and the worker's answer are pinned

- the hook: a last line without its newline counts as a line, an empty file passes, a symlink is judged by what it points at, and without CLAUDE_PROJECT_DIR the working directory decides
- the arithmetic behind the limits: linesIn counts the way Read numbers lines, CRLF included, and tokensIn rounds half up, 32,001 bytes to 8,000 tokens
- scrubbed escapes a carriage return, a C1 control and a NUL, and leaves the line break and the tab alone
- an external answer with no text in it, an empty string, parts without text, no choices or a null body, is no answer and falls back saying so
- a code-write target that climbs out through .. or names a folder is refused with nothing sent, and with the fallback off a worker that fails leaves no target behind

## 0.19.20 - 2026-09-20

fix: unplug with an empty name prints its usage line instead of unplugging the working directory

- resolve("") is the working directory, so ccsaver unplug "" unplugged the folder the command ran in and printed "unplugged " with no name
- an empty name is now the same as no name: the usage line of unplug on stderr and exit 1

## 0.19.19 - 2026-09-20

fix: a symlink already at the target is refused before anything is sent

- targetIn asked existsSync, which follows a symlink: a link at the target pointing at a file that does not exist yet read as no file, so the files went to the worker and only the wx flag of the write refused it afterwards, with EEXIST
- it asks lstatSync now, so a link at the target is an existing file wherever it points, and the refusal comes before the call, as the README promises for every refused target

## 0.19.18 - 2026-09-20

fix: an adapter that cannot be read is an error, never read as absent

- findAdapter skipped a private adapter it could not open and moved on to the bundled one of the same name, or to none: the hook then applied the bundled rules and limits in silence, and ccsaver adapter <name> wrote the bundled adapter plus one limit over the private file, losing its rules and its format
- it now asks existsSync before moving on, the way readWorker, readPrices and textAt already do, and refuses with the path it could not read; the hook records that refusal as the crash beside its gate line and keeps the default limits
- hook measured 20.34 → 19.62 ms mean without an adapter and 19.24 → 19.65 ms with the bundled strict-ts, medians 19.97 → 18.99 and 19.44 → 19.42, 30 paired runs each against the parent commit

## 0.19.17 - 2026-09-20

fix: a path that is no regular file is refused, never waited on

- the hook read a pipe named as file_path with readFileSync, which blocks until a writer appears: it hung until Claude Code's 5 s hook timeout, and bulk-read on the same path hung until the 120 s of the Bash tool
- measure asks the stat it already had whether the path is a regular file and answers unreadable for a folder, a pipe or a device without opening it; fileBlock refuses one by name before reading, so nothing leaves
- the test helper gives every spawned command 30 s, so a child that hangs fails its test instead of holding the suite
- hook measured 19.72 → 19.38 ms mean and 19.55 → 19.37 ms median, 30 paired runs against the parent commit

## 0.19.16 - 2026-09-20

fix: a file one byte past the byte limit is denied, however few lines it has

- the hook never counts the lines of a file over maxTokens × 4 bytes, and then judged it by Math.round(bytes / 4), which reads 32,001 bytes as 8,000 tokens: exactly one size passed the gate with its lines uncounted
- lines left uncounted now mean the file is past the byte limit, and the reason is tokens; the bytes/4 comparison this replaces could never fire on a counted file, because bytes ≤ maxTokens × 4 rounds to at most maxTokens
- hook measured 19.47 → 19.63 ms mean and 19.37 → 19.38 ms median, 30 paired runs against the parent commit

## 0.19.15 - 2026-09-20

refactor: what saved prints leaves the file that adds it up

- saved.ts reached 340 of the 350 lines the gate allows, carrying both the tally and every line the report draws from it
- report.ts takes the drawing, saved.ts keeps the adding up, which is the split test/saved.test.ts and test/report.test.ts already had
- 178 and 181 lines, and the report is now a pure function of a tally and a price list

## 0.19.14 - 2026-09-20

fix: a formatter that climbs out of the project is not run

- an adapter's format path was resolved against the project root and then run whatever it resolved to, so ../tools/fmt.sh reached outside the plugged project
- code-write is the one place ccsaver runs a command without asking, so the path it runs stays under the root it was given: outside, the line says so and the file is left unformatted

## 0.19.13 - 2026-09-20

docs: the saved page says what folding a month costs

- one line in memory at a time, not one month, with the measurement behind it

## 0.19.12 - 2026-09-20

perf: a month of the log is folded row by row, not held whole

- readMonth built an array of every row of a month before anything was counted: a synthetic 66.6 MB month cost 317 MB of RSS and 0.59 s
- foldMonth hands one row at a time to the tally, which takes the same month to 219 MB and 0.39-0.44 s, with the reader still synchronous
- storedKey stopped re-reading api-key on every event when no key is stored: the miss is remembered now, so the hook opens that file once per process instead of once per line it writes

## 0.19.11 - 2026-09-20

refactor: worker.json leaves config.ts for endpoint.ts

- config.ts owned the plugged roots, the adapters, how a file is weighed and the endpoint, and stood at 309 of the 350 lines this project's own gate allows
- what left is what the hook never imports: readWorker, writeWorker, setFallback, setClaude and the Worker type, so config.ts is 220 lines and the hook's import list is untouched
- measured paired, two rounds of 30 runs each: 30.1 and 30.4 ms whole against 31.4 and 30.0 ms split, which is free rather than faster, and docs/measurements.md says so

## 0.19.10 - 2026-09-20

refactor: one painter for doctor and for saved

- painted and tinted were the same two lines of ANSI, written once in doctor.ts and once in saved.ts, beside the inColour they both had to import
- tinted lives in state.ts now, next to scrubbed, which is the other thing that decides what a terminal is shown, and inColour stops being an export

## 0.19.9 - 2026-09-20

fix: a model that denied nothing is not asked for a price that changes nothing

- a month that changed model printed "claude-sonnet-5 denied 0.00 M tokens here and has no price", which is the line for a model whose reads were all ranged
- it now says nothing was denied under that model and that its ranged tokens are left out with it, and it names no command, because a price there would move neither column

## 0.19.8 - 2026-09-20

fix: a command says no to the arguments it cannot take

- ccsaver price claude-opus-5 5.00 99.00 stored 5.00 and dropped the rest without a word, and so did log on nonsense, list extra, plug a b c and doctor now
- the README says a command given the wrong arguments prints its own line of the table and exits 1: that is what it does now, one arity per command through atMost
- a known command with no line of its own, --version, gets "wrong arguments" and the whole table instead of being called unknown

## 0.19.7 - 2026-09-20

fix: a file in the log folder that is no month never stops saved all

- monthsOf read any events-NNNN-NN.jsonl, readMonth refuses every month but 01 to 12, so one stray events-2026-13.jsonl made ccsaver saved all exit 1 and print nothing
- the shape of a month is one regular expression now, exported from log.ts, and the folder listing filters by it instead of carrying a looser copy
- src/cli.ts held a third copy of the same literal and reads that one too

## 0.19.6 - 2026-09-20

fix: saved counts the denials and the answers the session read back

- the with column held the worker's input tokens, the fallback's dollars and the ranged reads, and nothing the session itself paid because of ccsaver
- a denial message is ~94 tokens and every delegation ends with an answer the session reads, which the log has recorded as answerChars all along
- both are added up at the foot and left out of the columns, because no line of the log says which model was running when the answer came home; all four blind spots lean towards flattering ccsaver, so all four are printed

## 0.19.5 - 2026-09-20

fix: a key no HTTP header can carry is named, never a host that cannot be reached

- a line break or an accent in api-key, the kind a paste brings along, makes fetch throw before the request leaves, and fellOf read that as "unreachable"
- so every delegation went to the paid fallback under a note that blamed the provider, and doctor failed the probe line instead of the key line
- rule 3.5: name the cause. keyIsCarriable checks it first, the note and doctor say what is wrong with the key, and the log gets a "key malformed" fell

## 0.19.4 - 2026-09-20

fix: a prices.json that is not an object stops the command

- an array, a number, a string, a null or a truncated file read as "no price at all", and ccsaver price then wrote a fresh file over whatever the broken one held
- it is rule 3.4 of CONTRIBUTING, the one writeLimits and readWorker already keep: absent means defaults, present and malformed stops the call
- docs/configuration.md already promised this; the code is what was wrong

## 0.19.3 - 2026-09-20

test: three test files split by responsibility before they hit the gate

- cli.test.ts was at 350 of 350 lines, transport.test.ts at 347 and saved.test.ts at 338: the next test in any of them broke the whole-file gate
- launcher.test.ts takes what only the sh launcher does: key set, setup, the symlink and a relative CCSAVER_HOME
- fallback.test.ts takes the paid Claude worker, transport.test.ts keeps the external one, which is the split src/transport.ts already has
- report.test.ts takes what ccsaver saved prints, saved.test.ts keeps the tally it prints from
- saved.test.ts carried its own copies of gateRow, denialRow, twentyDenials, monthBack and logHome: they come from test/helpers.ts now, the way prices.test.ts already read them

## 0.19.2 - 2026-09-20

fix: the saved report reaches the terminal painted, and never draws half a comparison

- say() scrubbed the whole line before writing it, so the colour the band paints itself with arrived as the six characters \x1b[31m: the report is now written the way doctor writes its findings, scrubbed at its one untrusted source and painted outside the scrub. Measured through a pty: ^[[32m now against \x1b[32m before, and a control character in worker.json's model still comes out as \x1b
- a month whose every denial sits under a model with no price drew without at $0.00 against a with that had one, which reads as a loss and is only a missing rate: it now says there is no without side to draw, and names the tokens it left out

## 0.19.1 - 2026-09-20

fix: a losing band reads low to high, not backwards

- saved paired the 1.9x arm with the left of the band and the 2.8x arm with the right, which reads the right way round only while the saving is positive: a month where the ranged reads cost more than the denied ones printed -$0.0011 - -$0.0016, a range running downhill
- the two arms are now sorted before they are printed, and the verdict reads the better and the worse arm by name instead of by position

## 0.19.0 - 2026-09-20

feat: saved draws the bars from the first denied read

- the twenty-event floor is gone, and ENOUGH and seen() with it: the denied and delegated counts printed over the bars are the sample they rest on, and reading a thin one as thin is the reader's work, not a refusal the report makes for them
- a month with no denied read and no ranged read has nothing to set side by side and says so where the bars would go, instead of a bar drawn from zero
- docs/configuration.md and commands/saved.md drop the refusal and say there is no minimum

## 0.18.0 - 2026-09-20

feat: the worker price carries the model it points at

- price lists it, the confirmation line and the foot of the report all name the model from worker.json beside the word worker, so a worker aimed somewhere else months ago is never read as the one running now
- the price column is now as wide as its longest name, which a fixed 28 could not hold once a name carries a model
- docs/configuration.md says where the model shows, and its example report carries one

## 0.17.0 - 2026-09-20

feat: ccsaver price with nothing after it lists what is set

- there was no way to read the prices back: price alone answered with its own usage line
- it now prints one model to a line with its rate, and names the command to set the first one when none is stored
- the price tests moved to test/prices.test.ts, because adding this one took test/saved.test.ts to 364 lines, past this project's own 350; the log fixtures they shared are in test/helpers.ts

## 0.16.0 - 2026-09-20

feat: a worker that costs nothing is set down as free

- a free tier had no way to say so: 0 was refused as a price, and the report kept asking for a number that does not exist while already counting those tokens at zero
- ccsaver price worker 0 records it, and the report writes that the worker is free instead of naming the command again
- a model price stays above zero, because a model that charges nothing is a typo

## 0.15.0 - 2026-09-20

feat!: a price belongs to a model, not to the whole month

- prices.json held one main rate applied to every read of the month, so a month that ran Opus at $5 and Fable at $10 was priced wrong whichever number was typed, and nothing said so
- ccsaver price <model> <usd> sets one rate per model; the report prices each model's reads at its own rate, reading the model the gate now records
- a model with no price of its own is named with the command that gives it one and its tokens are left out, because a rate borrowed from another model is a number without a source; reads the hook could not name a model for are counted apart the same way
- prices.json carrying the old single main price is refused rather than read as the rate for everything
- src/prices.ts is the thirteenth file on the map and owns that file, its shape and its two writers

## 0.14.0 - 2026-09-20

feat: the gate records which model the session was running

- a price belongs to a model, and until now nothing in the log said which one ran, so one global rate was applied to every month whatever it was spent on
- Claude Code hands the hook a transcript_path; the hook reads the last 64 KB of that file and takes the model of the last assistant line
- it parses whole JSON lines instead of matching text, because a model name written in the conversation would otherwise be read as the one in force, which this repository's own sessions produce
- the lookup sits inside the branch that writes a line, so it costs nothing while the log is off: 21-23 ms before against 19-21 ms after per Read with the log off, 21-22 against 22 with it on, three rounds of 30 runs per arm

## 0.13.8 - 2026-09-20

fix: under twenty, saved names the two things it counts

- it said "8 events here" directly under three lines showing 5 denied reads, 63 ranged reads and 3 delegations, and "events" is the word docs/events.md uses for log lines, of which that month had 345
- the twenty are denied reads plus delegations, the two sides of the comparison; the line says so now

## 0.13.7 - 2026-09-20

refactor: said is transport's own, not an export nobody imports

- the synchronous stderr write of 0.12.6 was exported by reflex; CONTRIBUTING cites it by name, and test/conventions.test.ts checks the symbol is there, not that it leaves the file

## 0.13.6 - 2026-09-20

refactor: saved.ts replaces roi.ts, and a Spend is not a Tally

- the file was named roi while the command it serves is saved, in a repository whose README fixes that everything doing something is a verb
- its Tally and the citation Tally of answer.ts shared a name and nothing else, one counting money and the other counting quoted lines; the money one is a Spend, and its zero is NOTHING_SPENT
- Band, monthsOf, tallyOver and readPrices were exported and imported by nobody, in src or in test: the file now exports only what another file reads

## 0.13.5 - 2026-09-20

refactor: log.ts owns how a number is read out of one of its rows

- numberAt was private to roi.ts while doctor read a cost with its own inline typeof, so the module that writes the rows did not own how they are read back
- doctor picks up the Number.isFinite guard it lacked, which is what kept a cost of Infinity in the log out of the spent line
- Row joins Rows, so the two readers name the shape instead of spelling it

## 0.13.4 - 2026-09-20

refactor: one place merges an adapter's limits with the defaults

- limitsFor in config.ts and limitsOf in hook.ts wrote the same two ?? DEFAULT_LIMITS lines, so a third default would have had to be added twice
- limitsFrom takes the Adapter and both call it; the two keep the failure modes that differ on purpose, a Refusal in the command and a crash event with the defaults in the hook
- the hook imports no new module, so its cost per Read does not move: 21 / 19 / 19 ms before against 21 / 19 / 19 ms after, three rounds of 30 runs per arm with the compile cache warm

## 0.13.3 - 2026-09-20

docs: the environment table names saved beside doctor as what paints

- the row said only doctor read NO_COLOR and TERM and that nothing else is ever painted, while ccsaver saved has painted its band green or red since 0.11.0
- the saved section of the same page already documented the red, so the table was the half that drifted

## 0.13.2 - 2026-09-20

fix: the launcher stops an old node before plug, not only before setup and doctor

- a node under 24.2 cannot strip the types of src/, so every command that skipped the check answered with a parse error instead of a sentence
- plug joins setup and doctor because those three are what a person types before anything works
- bulk-read and code-write stay unchecked on purpose: the check is a second process start and costs 14 ms, measured at 32.3 ms against 46.7 ms for ccsaver list, mean of 20 runs over three rounds, which every delegation would pay

## 0.13.1 - 2026-09-20

fix: an adapter limit takes a ceiling of a million

- maxLines and maxTokens were any positive integer, so a typed extra zero made doctor write a maxLines+1-line throwaway file on every run and raised what the hook reads whole on every Read to maxTokens times four bytes
- the ceiling is checked where the number is typed as well as where it is read, so the command that writes an adapter can never write one the next command calls malformed

## 0.13.0 - 2026-09-20

feat: doctor checks prices.json and the adapters folder

- the permission sweep covered the state folder, the key, plugged and worker.json, and stopped there, while the README lists prices.json and your own adapters/ as part of the same folder
- both are optional, so they are checked once they exist and say nothing before: a warn on a file most people never create is noise
- adapters is the one that matters, because a folder made by hand comes out world-readable and the adapters in it carry a project's house style; the events fixture was making one at 755, which is what caught it

## 0.12.8 - 2026-09-20

fix: the denied line of doctor reports the middle of the whole sample

- with an even number of denied reads it printed the upper of the two middle values and called it the median, so 351, 351, 401, 401 read as 401
- middleOf averages the two, which is what a median is; an odd sample and an empty one are unchanged

## 0.12.7 - 2026-09-20

fix: saved never paints a band that crosses zero as a saving

- the red branch asked for saved.high below zero, so a band with a loss at its low end and a saving at its high end came out green with a negative percentage beside it: measured, 15 denials of 400,000 bytes against 15 ranged reads and $1.20 of Haiku printed -$0.25 - $0.20 and -3 % - 2 %, in green
- a band that crosses zero now says so in words and takes no colour, because neither a saving nor a loss would be true
- the instead line said "of those files" while it counts every ranged read in a plugged project, whether or not a denial caused it; it now says "while plugged", and the foot says the same

## 0.12.6 - 2026-09-20

fix: the line a stop prints reaches stderr before the process goes

- fail wrote through process.stderr and then called process.exit, which drops whatever the stream has queued; Node queues writes to a pipe on macOS, so the one Error line that is the whole contract of a stop could be lost there, and every note that said why a call was falling back with it
- said writes with writeSync and only falls back to the stream when the sync write is refused
- not reproducible on Linux, where a pipe is written synchronously: the existing suite covers that the line still arrives, and the macOS arm needs measuring on a Mac

## 0.12.5 - 2026-09-20

fix: a state folder that cannot be made private stops the command with its cause

- mkdirSync and chmodSync threw a bare Error, so cli.ts filed a read-only state folder as a crash, which is the channel reserved for a bug in ccsaver
- writePrivate names the file and carries the errno through, so the user reads EACCES and not a stack

## 0.12.4 - 2026-09-20

fix: a worker url is https, or http to a local host, and no other scheme

- isEncrypted only asked the host on the second branch, so ftp://localhost and ws://127.0.0.1 were stored as workers: fetch cannot use either, so every call fell to the paid Haiku under a note that blamed the host
- the key never travelled, because fetch refuses the scheme before it sends, but doctor reported a url that was never valid as one that was unreachable

## 0.12.3 - 2026-09-20

fix: a long session id no longer defeats the 4,000-byte log line

- a line past the cap is replaced by a stub, but the stub keeps the head, and session was the one field of that head coming from outside: a session id of 9,000 characters wrote a 9,094-byte line, over the 4,096 that keeps two appends from tearing each other
- sessionOf cuts it at 200 characters, which bounds the stub by construction whatever the hook is handed on its stdin

## 0.12.2 - 2026-09-20

fix: a log that cannot be read stops the count instead of reporting zero

- readEvents and readMonth turned every failure to read into an empty month, so a file with the wrong owner, or one past what readFileSync can hold as a string, made ccsaver saved print a clean zero over a full month of events
- rowsAt asks existsSync before it hands back no rows, the way readWorker, keyIsStored and readPrices already told absent from unreadable
- doctor turns that into one FAIL log: line and still reports everything else, the way it already does for a worker it cannot read
- readMonth takes YYYY-MM and refuses anything that could steer a reader out of the log folder
- doctor no longer stops on a log file that disappears between its existsSync and its statSync

## 0.12.1 - 2026-09-20

refactor: log.ts owns the shape of a row and the key of a month

- the row type was declared once in doctor.ts and again in roi.ts, and roi.ts derived the month of the log from a date of its own
- log.ts writes the file that carries both, so it exports Rows and monthKey and the other two read them from there

## 0.12.0 - 2026-09-20

feat: /ccsaver:saved reads the report back with the caveats a summary drops

- `saved` shipped without a slash command, and it is the one whose output cannot be read casually: a session that turns its 1.9-2.8x band into a single number, or gives `denied` without `instead`, undoes the whole design of the command
- the prompt makes both compulsory, carries every footnote back (nothing replaced those reads, calls counted at chars/4, the gate seeing the Read tool only), reports a negative saving as a real answer, and refuses to invent a price because an invented one makes every figure under it fiction
- `commands/` had no test at all: the skills have been tied to their subcommands for a while and the prompts never were, so a renamed command could break one in silence
- two guards now, over `commands/` and `skills/` alike: every `ccsaver …` a prompt names is a command `USAGE` answers, and every file carries the description the plugin menu shows
- CONTRIBUTING 2.1 writes down why there are four files and not fourteen, command by command, and asks 4.5 for a per-session number before a fifth lands

## 0.11.0 - 2026-09-20

feat: ccsaver saved says what the log cost, and what it would have cost without

- the long form of doctor's one-line `spent:`, over the month in course, a month you name, or `all`, reading one month into memory at a time
- `ccsaver price main|worker <usd>` stores dollars per million input tokens in `prices.json` (600), apart from worker.json so the file holding the fallback switch gains no surface; no price ships, because one would go stale and 4.5 forbids a number without a source, and without `price main` the report counts tokens and stops
- the external worker's input tokens were nowhere: `contentOf` read the answer and dropped the `usage` block, so the call's own size was only ever chars/4; `inTokens` now carries what the endpoint reports, and the report counts how many calls reported none
- every figure is a band, because a real Read measured 1.9-2.8x the bytes/4 estimate; it is the same unknown on both sides, so the arms pair low with low and the percentage barely moves while the dollars swing by half
- `instead` sits beside `denied` on purpose: a denial is not a saving, the model reads by ranges afterwards and pays for those, and the foot says the gate watches the Read tool only, so a Grep or a cat is in neither column
- a month whose denied reads have nothing recorded against them is named as the most flattering reading there is, under twenty events it refuses to judge, and a month that cost more than it saved prints a negative, in red, with no percentage
- `inColour` moves to state.ts so doctor and the report decide about NO_COLOR and a dumb terminal the same way

## 0.10.10 - 2026-09-20

docs: the README table is one command per row, and says what is written inside a project

- `unplug` shared a row with `list` and `doctor` with `version`; every command has its own row now, in the order `USAGE` prints them
- `bulk-read` and `code-write` join the table, because `USAGE` has always printed them and the sentence under it claims the table is what `ccsaver` with no command prints
- two lines said "nothing is ever written inside your projects" while a third documented the one thing that is, the target of a `code-write`; what they meant is that ccsaver keeps no state of its own there, so that is what they say
- the protected places gain `.cargo`, `.yarn` and `.mvn`, which `PROTECTED_PLACE` has and the list did not
- CONTRIBUTING 2.5 counts the lines it has rather than the ones it had

## 0.10.9 - 2026-09-20

fix: an adapter file holding an array is malformed, not an empty adapter

- `isRecord` is true for an array, and `Object.keys([])` is empty, so an adapter file of `[]` passed the unknown-key check and read as `{}`: a broken config taken for an absent one, which is 3.4 in miniature
- the guard is in `adapterOf` rather than in `isRecord`, because the other six callers destructure fields an array cannot have and already answer Refusal or undefined
- `Delegation.mode` goes with it: nothing ever assigned it, the mode travels beside the delegation in `record`, and a field no writer fills is a second place for the same value to appear

## 0.10.8 - 2026-09-20

fix: the measured line says when it had to sample the project

- `strided` measures at most four thousand files and takes one in N past that, which is the right bound, but the line read `measured: 4000 of 20000 files` and that reads as sixteen thousand binaries
- it now says `(1 in 5 sampled)` when it sampled, and nothing when it walked them all
- docs/configuration.md described the pruning, the 1 MB ceiling and the binary probe but never the cap, so the page reinforced the wrong reading
- the test builds the survey by hand instead of four thousand files, because the message is what changed

## 0.10.7 - 2026-09-20

fix: limitsFor returns the two numbers its type promises and nothing else

- it spread the whole adapter over the defaults, so an object typed `Limits` carried the `rules`, the `format` and the `after` of the project as well; TypeScript allows it because a spread gets no excess property check
- no caller reads them today, but the day one of them reaches a log line the adapter's rules land in a file docs/events.md promises holds metadata only
- it now names the two fields, the way `src/hook.ts` · `limitsOf` already did; the two stay apart because they differ in how they fail, `limitsFor` by Refusal and the hook by falling open (3.6)

## 0.10.6 - 2026-09-20

refactor: the adapter guard splits rejecting from building, and nothing is over 15 now

- `adapterOf` checked every field twice, once to reject and once to build, which is what put it at cognitive complexity 18 and made it 1.7's one written exception
- `fieldsHold` now says whether the fields hold and `adapterOf` builds from them, with the same verdict on all thirteen shapes the guard is asked about
- the link checker of `test/conventions.test.ts` was at 16 and unlisted, so 1.7's count was wrong twice over; its body moves to `brokenLink`
- `biome lint --only=complexity/noExcessiveCognitiveComplexity src test scripts` is now silent, and 1.7 says so instead of naming an exception

## 0.10.5 - 2026-09-20

fix: the secrets net catches a Stripe key, not only an OpenAI one

- the token shapes read `sk-`, with a dash, so `sk_live_…` and `rk_live_…` went out inside a file the way any other text would
- `[sr]k[-_]` covers OpenAI, Anthropic and Stripe with one character more, and the README stops naming `sk-…` as if it were the whole family
- measured against thirteen common shapes: the four that still pass are an AWS secret key, a JWT, a bare base64 blob and a URI with a password, all of them shapes whose false positives would deny ordinary fixtures
- the URI pattern was written and dropped: it refuses this repository's own README, which documents `https://user:token@…` as an example
- SECURITY.md already calls a better net an ordinary change, and the README already calls it a net

## 0.10.4 - 2026-09-20

fix: a worker.json that cannot be read stops the call instead of paying

- 3.4 fixed the malformed case and left the unreadable one: `attempt` returns undefined for ENOENT and for EACCES alike, so a worker.json with the wrong owner or the wrong mode read as "no worker"
- which turned `fallback off` back on without a word, the exact failure SECURITY.md lists under What counts, and made `ccsaver worker claude` answer "worker.json is not there yet" about a file that is there
- `readWorker` now asks `existsSync` before it reports no worker, and otherwise refuses by name; doctor already routes that Refusal into a FAIL line
- the key has told these two apart since `keyIsStored`; worker.json now does the same
- readPlugged keeps conflating them on purpose: there the same hole fails closed, which is the direction 3.6 asks for
- the test skips under root, where chmod 000 does not deny a read

## 0.10.3 - 2026-09-20

fix: what the worker answers cannot repaint the terminal either

- `scrubbed` guarded the funnels of `src/cli.ts` and doctor's finding loop, but the worker path has its own funnels and never got them: `fail` and `note` in `src/transport.ts` wrote straight to stderr
- so `ccsaver bulk-read --paths $'x\e[2J'` cleared the screen, and worse, `fail` prints the fallback's raw stdout when it returns no result, which is text from the worker outside its `<<<worker-output ID>>>` markers, the fourth line of SECURITY.md's What counts
- `fail`, `note`, the `wrote …` line and the answer of a `bulk-read` now go through `scrubbed`, the same funnel rule the cli side already followed
- the code of a `code-write` without `--target` stays byte for byte: it is a file's contents, and escaping an `\x1b` a source file legitimately holds would corrupt what Claude writes out; README names that one exception and takes it as one more reason to pass `--target`
- two tests, one with the control character coming from the worker rather than from an argument

## 0.10.2 - 2026-09-20

ci: the release workflow sweeps for missing releases instead of trusting the tag push

- `v0.10.0` reached GitHub and cut no release: GitHub triggers no workflow for the fourth and later tag of a single push, and here every commit carries a tag, so a six-commit push loses three of them silently
- release.yml now runs on a push to `main` and sweeps every `v*.*.0` tag that has no release yet, which is the loop docs/versions.md already asked a hand to run
- so a run that failed, or a tag the three-tag limit swallowed, heals on the next push instead of staying missing; `workflow_dispatch` forces a sweep without one
- a tag whose version has no section in CHANGELOG.md is named and fails the run at the end, so one bad tag never blocks the others
- the checkout takes fetch-depth: 0, because the sweep reads the tags
- docs/versions.md loses the sixteen-line manual loop it no longer needs, and `git config push.followTags true` joins core.hooksPath in the once-per-clone block
- CONTRIBUTING 5.5 names the new trigger; the job still takes contents: write alone and ci.yml stays read-only

## 0.10.1 - 2026-09-20

fix: a dumb terminal gets no escape sequences

- `painted` asked only whether stdout is a terminal and whether NO_COLOR is set; an Emacs shell answers yes to the first and showed raw `^[[33m`
- `TERM=dumb` now falls to the plain label, verified on a real pty: `warn state: …` against `^[[33mwarn^[[0m state: …` under `TERM=xterm`
- the pty test in survey.test.ts runs doctor once more with `TERM=dumb` and asserts the warn line is there and no escape byte is
- docs/configuration.md gains the row for `NO_COLOR` and `TERM`, which the table never had: what is painted, when, and that the word carries the meaning on its own

## 0.10.0 - 2026-09-20

feat: a mistake on the command line leaves a fail in the log

- docs/events.md already promised that a mistake on the command line is a `fail`; it was true for the seventeen Refusals and false for every command that fell through to the usage, which recorded nothing at all
- the row says which kind: `unknown command: frobnicate` against `wrong arguments: worker`, so the log tells a typo from a command called with the wrong shape
- the text goes through JSON.stringify on its way to the file, so a control character in it is escaped there without a second scrub
- a new test in events.test.ts walks both paths and pins the two texts in order
- docs/events.md names the two cases it was already covering in spirit

## 0.9.20 - 2026-09-20

fix: the refusals that hid the value they rejected now print it

- `invalid adapter name: Bad Name` never said what a valid one is: `an adapter name takes lowercase letters, digits and dashes; not: Bad Name`, the shape C2 gave the limit pairs
- `adapter <n> not found` now names the command that creates it, which is one `k=v` away
- the tab-or-line-break refusal was the only one of plug's four that did not name its root; it does, through JSON.stringify, because tab and newline are exactly what it is complaining about and they pass the scrub
- `the worker url must be https` names the protocol it read, `http:` or `not a url`, and deliberately not the url: a rejected one can carry a key in its query, and a test pins that the query never reaches the terminal
- docs/configuration.md publishes the adapter name rule, which lived only in a regex

## 0.9.19 - 2026-09-20

fix: nothing ccsaver echoes can repaint the terminal it prints in

- `ccsaver unplug $'x\e[2J'` cleared the screen; a path or an argument carrying a control character is now written as `\x1b` before it is printed
- `scrubbed` guards the funnels, not the call sites: `say` for every success line, the catch for every Refusal and crash, and doctor's finding loop, so a command added later is covered without being told
- newline and tab pass through, because they are the separators we compose ourselves: list keeps its tab-separated rows
- doctor scrubs only the finding text, never `painted`, so the level keeps its colour
- the launcher had the same hole ahead of Node and gets `plain`, which deletes rather than escapes because POSIX `tr` cannot escape; the property that matters, no control character reaching the terminal, holds on both sides
- README says it under the commands table

## 0.9.18 - 2026-09-20

fix: both settings that live in worker.json name the command that creates it

- `ccsaver fallback on|off` without a worker said only why it refused; it now ends in `run: ccsaver worker set <url> <model>`, which its sibling already did
- `ccsaver worker claude` keeps its own cause, `worker.json is not there yet`, so the two are parallel without pretending to share a reason they do not
- both adopt the `, run: <command>` tail doctor already uses for `key: missing, run: ccsaver key set`
- a new test walks the three ways in and fails if either sibling drops the command
- test/state.test.ts matched the old wording and now matches the command, which is the part worth pinning
- docs/configuration.md says all three name it

## 0.9.17 - 2026-09-20

fix: a bad limit pair names itself instead of repeating the usage

- `ccsaver adapter x maxLines=0` says `maxLines=<n> and maxTokens=<n>, n a positive integer; not: maxLines=0` instead of echoing the signature back
- the `Error: usage:` double prefix is gone: a refusal is a refusal, not a usage line
- no pair at all is its own message, `ccsaver adapter <name> needs maxLines=<n> or maxTokens=<n>`, so the empty case never leaves a dangling `not:`
- the junk loop in the adapter test now reads the message, not only the exit code, and asserts the offending pair is the tail of it
- docs/configuration.md says the command names back a pair it cannot take

## 0.9.16 - 2026-09-20

fix: a wrong argument gets the usage line of its own command

- a known command given bad arguments prints the header and its own lines of the usage table on stderr, not all fourteen: `ccsaver worker claude` goes from 18 lines to 4
- a word that is no command at all prints `unknown command: <word>` before the whole table, which it never said before
- `ccsaver key` and `ccsaver key get` now land on the `key set` line instead of the whole menu
- `usageFor` filters the same USAGE string the full listing prints, so the two can never drift
- HELP drops its `undefined` entry: the no-command case is checked where it narrows the type
- README states the rule the command surface already followed and never wrote down: settings are a noun and a value, actions are verbs, help goes to stdout with 0, a mistake to stderr with 1

## 0.9.15 - 2026-09-20

docs: every number in the pages has its note, and a test keeps every link resolving

- the rules of an adapter get the note rule 4.5 asks for, measured again because the old claim was written with the first commit and its conditions were never recorded: gemini-flash-lite-latest, four code-write runs per arm, a return type on the test callback in 3 of 4 with the rules against 0 of 4 without
- the import those rules were credited with, 4 of 4 against 0 of 4, does not reproduce: it came out right in both arms, because a model that copies the reference gets it right without being told
- Delegated writing of a test file and Where delegation starts to pay come back: 5695cab dropped them this morning and the two rows of the README table have pointed at nothing since
- test/conventions.test.ts now checks every markdown link in the repository, the file and the heading, which is what would have caught that

## 0.9.14 - 2026-09-20

docs: the pages say what the commands actually print, and the table names them all

- the sample output of an overshooting project was the one from before the fix became a command to run: it still read "an adapter with { "maxLines": 400 } would not"
- doctor's denied: line reports the median length of what it denied, not how long anything ran
- the README table was missing ccsaver adapter and ccsaver worker claude, both of them in the usage the command prints
- src is about 1,850 lines now, not 1,650

## 0.9.13 - 2026-09-20

test: the denied line and the plugin's own files get the tests they never had

- doctor's denied: line shipped without one: it now counts two denials of three whole-file reads, leaves the ranged one out of the total and its own probe out of the count, and says nothing at all while the log is off
- the plugin manifests get one too: both name the same plugin, hooks.json points at a file that exists and is executable, and so are bin/ccsaver and the two git hooks
- that is the part of claude plugin validate a read-only CI can run, and docs/development.md says why the fourth check of the gate stays a hand one

## 0.9.12 - 2026-09-20

fix: a path cannot forge the frame its file travels in

- the label of a file escaped its quotes and nothing else, so a folder named a"&gt;&lt; holding a file named file&gt; wrote a&gt;&lt;/file&gt; into the message and closed the block early: everything after it read as the worker's own text, and a line break in a name opened a second one
- angle brackets and control characters are escaped now, quotes as before, and a test builds that exact pair of names
- the marker around an answer carries 8 random bytes instead of 4

## 0.9.11 - 2026-09-20

fix: an answer that arrives in text parts is read instead of paid for twice

- contentOf took choices[0].message.content only as a string, so an endpoint that sends a list of parts, which some do for a model that reasons before it answers, counted as an incomplete answer
- every one of those calls fell through to paid Claude Haiku and said "answered 200 without a complete result"

## 0.9.10 - 2026-09-20

fix: doctor judges the whole answer typed at its offer, not its first 16 bytes

- the prompt read one buffer of 16 bytes: "yes               no" was read as "yes             ", which matches yes, and the fix ran
- what did not fit stayed in the terminal buffer and was read as the answer to the next offer
- it now reads to the end of the line, bounded at 4,096 bytes, and answers no to anything it could not read

## 0.9.9 - 2026-09-20

fix: a refusal is never swallowed, so a malformed adapter is never written over

- attempt turned every throw into undefined, a Refusal included, so a stop became a default wherever one was wrapped
- ccsaver adapter <name> maxLines=<n> on an adapter that is there but malformed read it as no adapter and wrote {"maxLines": n} over it: the rules and the format of that project were gone, and doctor's own offer did the same
- findAdapter tells an adapter that is absent from one that is broken; only the absent one starts from an empty adapter, which is what creating one needs
- CCSAVER_HOME must now be an absolute path, in the launcher and in the command: a relative one followed the working directory, so the same machine kept a different state per folder and doctor said the state did not exist yet

## 0.9.8 - 2026-09-20

perf: the survey counts a small file from the 8 KB it already read

- measure opened every file for the 8 KB that tells a binary one from a text one, then read the whole file again; a file that ends inside those 8 KB, which most source files do, was read twice
- /usr/include, 2,385 files: 42.9-46.5 ms against 51.6-56.9 ms, three rounds of seven runs per arm, same lengths reported
- dropping the probe instead of reusing it is the trap the numbers catch: 200 binaries of 900 KB beside 200 text files cost 28.4 ms that way against 12.1, because 180 MB the probe leaves unread get read whole
- headOf and the binary test move to src/config.ts, where the hook already reaches for them: the same eight lines lived in both files
- .cache, .gradle and Pods join the pruned folders: none of them holds a line of yours, and a proposal measured over them is measured over someone else's bytes

## 0.9.7 - 2026-09-20

refactor: one line counter for the hook and the survey, not one each

- linesIn was the same six lines in src/hook.ts and src/survey.ts, byte for byte, with LINE_BREAK beside it twice
- it lives in src/config.ts now, next to BYTES_PER_TOKEN and the limits it serves, which both files already import: no fourth module on the path of every Read, whose import list test/conventions.test.ts pins
- tokensIn joins it, so the bytes/4 estimate is written once instead of in the hook and inline in the survey
- the hook is unmoved: 52-53 ms against 52-55 ms, three rounds of 30 runs per arm, process spawn included
- the chars/4 of src/transport.ts stays where it is: it weighs a message, not a file, and docs/configuration.md tells the two apart on purpose
- Cited and Survey stop being exported: no file outside their own imports either

## 0.9.6 - 2026-09-20

fix: ccsaver adapter refuses a pair it would otherwise cut in half

- maxLines=400=oops was taken as 400, because split("=") dropped everything after the second field
- the guard that checked it also carried a condition that could never be true inside a filter, given.length === 0, already checked on the line below
- a command now takes the rest of the argument list instead of three fixed slots, so adapter stops reaching into process.argv behind the type that describes it

## 0.9.5 - 2026-09-20

refactor: doctor reads the month's log once, through the file that owns it

- the three readers of events-YYYY-MM.jsonl became one, readEvents in src/log.ts, which is the file the map gives the event log
- doctor used to read that file three times and parse it twice: once to see whether it existed and once per kind of row
- on a 40,000-line month, 9.1 MB, that is 105 ms against 47 ms, median of five rounds; on an ordinary month it is a millisecond either way
- the median of the denied lines was held in a const called longest

## 0.9.4 - 2026-09-20

fix: fallback on without a worker says so instead of confirming nothing

- it used to return quietly while the command printed "fallback on" and exited 0, so a setting that was never stored looked stored
- nothing reached the event log either, so the line the user was shown had no trace behind it
- fallback off already refused the same way: the switch lives in worker.json and needs one

## 0.9.3 - 2026-09-20

fix: the adapters folder is put back to 700 on every write

- mkdirSync leaves the mode of a folder that already exists alone, so an adapters/ made by hand before ccsaver wrote one stayed 755 while every other file of the state was 600 and the folder 700
- doctor never looked at it, so nothing said that the names of your adapters were readable by every user on the machine
- the adapter files themselves were already private: writePrivate has always written them 600

## 0.9.2 - 2026-09-20

fix: the release backfill says what it needs instead of failing once per tag

- without the GitHub CLI the loop ran gh nine times and printed the same
  "command not found" nine times, having created nothing
- it now checks for gh and for a logged-in session first and says so once
- its notes go to a temporary file rather than notes.md beside the sources,
  so a run that stops halfway leaves the working tree as it found it

## 0.9.1 - 2026-09-20

docs: plug points at doctor for later, and versions.md fills the missing releases

- the measurement is taken at plug and at every doctor and nowhere else,
  because the hook answers every Read inside 24 ms and cannot walk a tree;
  the plug prompt now says so and points at /ccsaver:doctor for when the
  project has changed shape, which costs nothing at runtime
- v0.1.0 through v0.6.0 are older than .github/workflows/release.yml, so
  they never fired it and no release exists for them; nothing creates one
  later, and the same holds for any tag whose run failed
- versions.md carries the loop that fills every gap, skipping the tags that
  already have a release and taking its notes from the section of
  CHANGELOG.md the workflow itself would have used
- a missing release costs only tidiness: the plugin installs by reading the
  repository through the marketplace, never from a release asset

## 0.9.0 - 2026-09-20

feat: doctor colours its levels and offers to run the fix it found

- a warn told the user a command and left them to copy it; on a terminal
  doctor now prints it and asks, and anything but y/yes/s/si/si leaves it
- the level of every line is coloured, green, yellow and red, so one warn
  among fifteen oks is seen instead of read for
- both need a real terminal: from a pipe, from CI or from /ccsaver:doctor
  the output is the plain text it always was and no question is asked, so
  nothing is ever applied without a person typing it, and NO_COLOR is obeyed
- the fix for a project with no adapter writes the adapter and plugs the
  project at it in one step, because either half alone changes nothing
- an adapter name proposed from a folder is lowercased and stripped to what
  an adapter name may hold: /tmp/tmp.XZ2O5UgAAp asked for an invalid name
  and the fix failed on it, and My_App now proposes my-app

## 0.8.0 - 2026-09-20

feat: ccsaver adapter writes the limits, and doctor counts what it denied

- plug and doctor named a JSON object the user then had to go and paste by
  hand; the line now ends in the command that does it, ccsaver adapter <name>
  maxLines=<n> maxTokens=<n>
- that command writes ~/.config/ccsaver/adapters/<name>.json at 600, creating
  the file or merging into what is already there, so an adapter that carries
  rules and format keeps them; it takes the two limits only, positive
  integers, and every other field is still edited by hand
- a project with no adapter gets a second command beside the first, the plug
  that points at it, because an adapter nothing points at changes nothing
- while the event log is on, doctor prints a denied: line: how many of the
  month's whole-file reads the hook really denied and the median length of
  those it did
- that is the measured answer beside the predicted one, and the two disagree
  usefully, because a project can hold long files the model never opens
- setup names adapters, which it never did, and the doctor and plug command
  prompts tell the model to offer the fix rather than describe it

## 0.7.4 - 2026-09-20

test: the symlink test is written the way the formatter wants it

- it built its two trees with the nested call biome expands, so the commit
  before this one left the repository one formatting error short of the gate
- it uses sourcesOf, the helper the other tests in the file already use

## 0.7.3 - 2026-09-20

docs: the plug command tells the user about both limits, not just maxLines

- it still said the run proposes a maxLines, which 0.7.1 made wrong: the
  survey weighs maxTokens too and a file can need both raised

## 0.7.2 - 2026-09-20

test: the walk's refusal to follow a symlinked directory gets its guard

- docs/configuration.md promises the walk never follows one, and nothing
  checked it: a linked tree would have been counted twice and a loop could
  have hung plug and doctor
- the test links a heavier tree and the project onto itself, and pins that
  neither reaches the count

## 0.7.1 - 2026-09-20

fix: the survey counts the heavy files it was dropping, and weighs both limits

- a file past the byte limit was left out of the count, on the grounds that
  maxTokens denied it whatever its lines were; that silently dropped the large
  source files the measurement exists to find, among them a 2,477-line
  stylesheet and a 1,058-line test file
- one monorepo's 19-in-20 length read 344 lines with those out and 396 with
  them in, so the verdict flipped from "the limits already fit" to asking for
  maxLines 400: the filter was deciding the answer
- the ceiling is now 1 MB, which nothing read whole reaches, and a binary file
  is told by its first 8 KB rather than by its size
- maxTokens is measured and proposed beside maxLines, because both deny and one
  file can need both raised: that 1,058-line test file is 41 KB, so moving the
  line limit alone leaves it denied by the token limit
- only the limit that fell short is named in the proposal
- reading the head before the whole file holds the 933-file monorepo at
  10.9-24.8 ms, where reading every file whole ran 13-46 ms and swung with the
  cache
- measurements.md carries the three corpora and the 10x spread between them

## 0.7.0 - 2026-09-20

feat: plug and doctor measure the project and propose a limit

- the 350-line and 8,000-token defaults are this repository's own house
  style, not a measured optimum, and nothing told a user the knob existed:
  maxLines appeared twice in the docs, both times inside docs/configuration.md
- ccsaver plug now walks the project, prunes the build folders, never follows
  a symlinked directory, counts the lines of every text file under the byte
  limit and reports the length 19 files in 20 stay under
- when that length clears the limit in force it says so and proposes nothing;
  when it does not, it names the maxLines that would fit, rounded up to fifty
- the proposal never falls below the default, and under twenty countable
  files it refuses to judge: one file in twenty is not a number
- doctor measures again on each run and adds one warn shape: line per project
  that has outgrown its limit, never a FAIL, because nothing is broken
- files past the byte limit are left out of the count: maxLines does not
  decide their fate, maxTokens already did
- the walk costs 9.6-18.9 ms on a 933-file monorepo and 0.9-3.1 ms here, and
  runs in plug and doctor only, never in the hook
- doctor moves out of cli.ts, which had 17 lines left under the 350-line gate,
  and survey.ts is the tenth file; shown, Limits, BYTES_PER_TOKEN and limitsFor
  move to the file that owns them, so the hook gains no import and no start-up

## 0.6.2 - 2026-09-20

ci: a v*.*.0 tag becomes a GitHub release with its changelog section

- .github/workflows/release.yml: on a tag push it pulls that version's section out of CHANGELOG.md with awk and hands it to gh release create, which is preinstalled on the runner, so no new action has to be pinned
- it fails instead of publishing an empty release when the changelog has no section for the tag
- only minor and major tags fire it: every commit is a version, so releasing each one would leave six releases behind a six-commit push, and a patch is already in the changelog
- it is its own file so ci.yml, the one that runs on every push and pull request, keeps permissions: contents: read; the release job alone takes contents: write
- CONTRIBUTING 5.5 names that exception and why it is the only one; docs/versions.md says what a tag does when it reaches GitHub, and that a release changes nothing about installing the plugin

## 0.6.1 - 2026-09-20

fix: one changelog file, from the newest version back to the first commit

- the hook used to hand what no longer fit to docs/changelog/N.md; docs/changelog is gone and its two sections, 0.2.0 and 0.1.0, are back at the bottom of CHANGELOG.md
- changelogOf is the intro, the new section and the parent's sections, with nothing measured and nothing dropped: filing, filedAt and the archive dedupe are gone, and with them the only reason scripts/version.ts imported src/config.ts
- CHANGELOG.md joins pnpm-lock.yaml in UNREAD_WHOLE. It grows by one section per commit and is read from the top, so splitting it buys nothing: there is no responsibility in it that could move to another file, and ccsaver's own hook answers a whole-file Read of it with Grep or a range, which is how a changelog is read anyway
- the test that fails if the hook loses a section stays: it commits until the file is past 350 lines and asserts every version is still in it, once
- CONTRIBUTING 1.8, 2.1 and 5.3, CLAUDE.md and docs/versions.md say so; the intro's link to the version hook pointed at a README anchor that moved to docs/versions.md two commits ago

## 0.6.0 - 2026-09-20

feat: the version hook tags every commit it versions

- there was not one tag in 51 commits, although the hook has computed the number since 0.2.0: it now writes an annotated v<number> on the commit it has just amended
- annotated, so git push --follow-tags carries the tags along with the commits
- an --amend leaves no orphan: the tag is forced onto the commit that replaced the old one, and the tag the commit carried before is deleted when the number moved and nothing reachable from HEAD points at it any more
- it stays out where it already stayed out: a merge commit, a parent with no version, and the middle of a cherry-pick or a patch series
- test/version-hook.test.ts commits, amends with the same message and amends again with a type that moves the number, and asserts git tag --no-merged HEAD is empty at the end
- docs/versions.md and CONTRIBUTING 5.3 say so; commits older than this one have no tag and keep their number in package.json

## 0.5.2 - 2026-09-20

docs: a README someone can read in thirty seconds, and the detail in docs/

- 246 lines and 31,598 bytes became 131 lines and 12,359: the gate stops at 32,000, so the README had 402 bytes of room left and now has 19,641
- the first 18 lines are what it does in two sentences, the third-party warning, and the quickstart: two commands to install, /ccsaver:setup, /ccsaver:plug
- Install spent more words justifying a hard install than installing; that argument went with the clone two commits ago, and the section is now a code block and one sentence
- the detail moved next to docs/measurements.md: docs/configuration.md (the worker, the key, the fallback, doctor, adapters, environment variables), docs/events.md, docs/versions.md, docs/development.md
- nothing was simplified outwards: the warning that plugging in sends whole files to a third party is above the fold, "what leaves your machine" and "what the two permission rules grant" stay whole, the limits table keeps its worst rows and links every number to its note, LICENSE and NOTICE stay
- the walls of text are broken up: four paragraphs of over 900 characters became bullets, and no line in the README passes 500
- CLAUDE.md carries the map of which page specifies what, because the specification is no longer one file; CONTRIBUTING 1.5, 4.4, 4.5, 5.1 and 5.3 point at the page that now holds each subject
- every internal link and anchor in the README, CLAUDE.md, CONTRIBUTING, SECURITY and docs/ was checked to resolve

## 0.5.1 - 2026-09-20

fix: the version hook files the sections that no longer fit, instead of dropping them

- changelogOf used to return the changelog that fits and let the rest fall off the bottom; it now returns that text and the overflow, and filing puts the overflow on top of the newest file in docs/changelog/, starting the next numbered file when that one is full
- every archived file stays under the same 350 lines and 32 KB the whole repository does, so nothing has to be excused from test/conventions.test.ts
- an overflow batch always comes out of a changelog that fitted, so a fresh file always holds it: no batch can be too big to file
- a version lives in exactly one file: a section the archive already carries is not carried in CHANGELOG.md too
- a newborn file is staged before the amend, and taken back out of the index if the amend fails
- docs/changelog/1.md: 0.1.0, the 17 commits from before the hook existed, rebuilt from git log --reverse eaa9445~1 with the bullet filter of sectionOf; their subjects and bullets are the ones in the history, and no version that never existed was invented
- test/version.test.ts is now the pure functions and test/version-hook.test.ts the hook in a real repository; "no section is ever lost" commits until the changelog overflows and asserts every version appears once across the changelog and the archive

## 0.5.0 - 2026-09-20

feat: ccsaver sets itself up from inside Claude Code

- commands/: /ccsaver:setup, /ccsaver:plug and /ccsaver:doctor, short markdown that calls the ccsaver already on the Bash tool's PATH. A session needs no shell of its own any more
- ccsaver setup asks for url, model, key and fallback and ends with doctor, in the launcher, where the echo can be turned off; it shares store_key with key set so the key file keeps one writer
- the key still never travels as an argument: key set reads one line from stdin when there is no terminal, so ccsaver key set < file works from a session and /ccsaver:setup is told to delete the file and never read it
- ccsaver plug with no directory plugs the one it runs in
- the key entry of the COMMANDS table is gone: it only pointed at the launcher, and the usage says where key set lives
- README: the three slash commands under Install, the two ways the key arrives, plug with no directory; CONTRIBUTING 2.1 places setup and commands/ off the map

## 0.4.15 - 2026-09-20

docs: install from GitHub, in two lines and one copy

- claude plugin marketplace add abgonzalez93/ccsaver and claude plugin install: no git clone, no ~/bin, no symlink, and no second copy of the code to keep in step
- the two paragraphs that argued against the GitHub source are gone with it: from a GitHub marketplace the copy in Claude Code's cache is the one that runs, so claude plugin list stops disagreeing with ccsaver version
- Update is claude plugin marketplace update plus claude plugin update; the "pull the clone" route went with the clone
- Uninstall no longer removes a link nobody made
- nothing in src/, hooks/ or skills/ assumed an editable clone: every path they use is relative to the plugin root (import.meta.dirname, CLAUDE_PLUGIN_ROOT)
- what this costs until the next commit: with no launcher on a personal PATH, ccsaver key set has no terminal to turn the echo off on, so the key has to arrive on stdin

## 0.4.14 - 2026-09-20

ci: dependabot leaves @types/node on the minimum supported Node

## 0.4.13 - 2026-09-20

ci: dependabot keeps the pinned action SHAs and the dev dependencies moving

- CONTRIBUTING 5.5 asks for actions pinned by commit SHA, and a pinned SHA never updates itself: nothing in the repository proposed a newer one
- one weekly pull request per action (ci:) and per development dependency (build:), the prefixes the version hook of 5.3 needs to bump the patch number
- the npm updates wait a day, matching the minimumReleaseAge of pnpm-workspace.yaml that 5.4 relies on
- nothing is merged by itself: a pull request is still the proposal 5.4 asks for numbers and approval on

## 0.4.12 - 2026-09-20

refactor: state.ts becomes state, log and config

- state.ts held five responsibilities in 314 of the 350 lines the gate allows, so the next feature would have forced the split in the middle of itself
- src/state.ts is the state folder, the key, the guards and Refusal (75 lines); src/log.ts is the event log and its switch (63); src/config.ts is what the user configured, the plugged roots, the adapters and the worker (206)
- the log could not simply move out: it needs stateHome and the stored key, and the five commands that record a config event would have pointed back at it, which biome's noImportCycles refuses. The three-way split is what makes the arrows go one way, and CONTRIBUTING 2.1 now says so
- record reads the cached key through storedKey instead of the module-level secret it no longer shares a file with
- it is not free: the hook imports three modules instead of one and pays 1.7 ms more per Read, 22.1 ms against 23.8 ms, three paired rounds of 30 runs per arm, every round after above every round before. The README, docs/measurements.md and CONTRIBUTING 4.4 carry that number, and 4.4 now prices a further import at about 0.85 ms

## 0.4.11 - 2026-09-20

refactor: the commands are a table, not a switch of thirty-three branches

- main was the flat switch CONTRIBUTING 1.7 wrote down as an exception at cognitive complexity 33; it is now under 15 and the rule has one exception left, adapterOf at 18
- COMMANDS maps each subcommand to a handler that returns its exit code, or undefined for "show the usage", which is what every break in the switch meant
- commandOf reads the table with Object.hasOwn, so toString still gets the usage and not a function off the prototype
- doctor stays outside the table because it is the one command that awaits the network; the handlers are synchronous and main awaits nothing it does not have to

## 0.4.10 - 2026-09-20

refactor: the fake claude binary takes its cost, so spent.test writes no second copy

- spent.test.ts carried its own hand-written copy of fakeClaude, byte for byte, only to report total_cost_usd 0.0125
- fakeClaude takes the cost as a fourth default parameter; every other caller keeps the zero it had

## 0.4.9 - 2026-09-20

refactor: a refusal is called a refusal

- fileBlock called one kept and another held, and targetIn called a third kept, for values that are the message of pathRefusal, contentRefusal and targetRefusal
- refuse takes the reason and the path and stops the call, so the three sites read as what they do and no local has to be named twice in one scope

## 0.4.8 - 2026-09-20

refactor: checked parses, verifies and rewrites in three named steps

- it did all three in one map and counted the tally up by mutating it inside that map, against rule 1.4
- citationOf reads a row, resolved finds the line the quote really sits on, rewritten prints the row back, and counted folds the verdicts into the tally with reduce
- CONTRIBUTING 1.4 shows the case it was written for instead of one that was never wrong

## 0.4.7 - 2026-09-20

refactor: one fetch site carries the headers, the timeout and the redirect

- probe in cli.ts repeated the content-type, the bearer header, AbortSignal.timeout and redirect: "error" of invokeExternal, so a change to how ccsaver talks to a worker had two places to reach
- postJson in transport.ts takes the url, the key, the body and its own wait; probe still spends PROBE_TIMEOUT_MS and invokeExternal EXTERNAL_TIMEOUT_MS
- CONTRIBUTING 4.1 names one fetch site with two callers

## 0.4.6 - 2026-09-20

refactor: the delegate event has a shape three files can see

- delegation was a Record<string, unknown> that transport and worker filled blind, so a typo in a field name was a silent missing column in the log
- Delegation names every field the README already documents for the delegate event; single writes are dot access and grouped ones carry satisfies Delegation, so both are checked
- cited takes the Tally of answer.ts by a type-only import, erased at runtime, rather than a second copy of its four fields; CONTRIBUTING 2.1 records that arrow

## 0.4.5 - 2026-09-20

refactor: the hook's gate reads as five named steps

- gate stood at cognitive complexity 26, the highest it has been, after the size check moved in front of the read
- reasonOf, denial, placeOf, rangeOf and limitsOf take one decision each, so gate falls under 15 and stops being a written exception; CONTRIBUTING 1.7 now lists two
- Limits is the pair the adapter and the defaults agree on, passed once instead of two numbers threaded through
- no behaviour change: the hot path measures 1.7 ms unplugged and 21.9 ms plugged, against 1.7-1.8 and 21.5-22.4 before (mean of 30, process spawn included)

## 0.4.4 - 2026-09-20

docs: CONTRIBUTING says what the code does today

- 2.5 counted about 1,250 lines of src/ and there are about 1,400
- 2.1 now names bin/ccsaver as the second writer of the log line format, so a change to LOG_VERSION touches both
- 3.3 was missing three boundaries the code validates by hand: the plugged file in readPlugged, the month's own log lines in spent, and package.json in version
- 3.5 quoted the EPIPE lines invokeClaude no longer has, and says nothing about the timeout or the unreadable key; 3.6 gains the adapter the hook cannot load
- 4.2 said the two waits fit in 120 s and the guard added up two; both now name BASH_BUDGET_MS and the formatter that takes what is left
- 1.7 records the gate at 26, where measuring the size before the read left it
- 1.6 lists isSecretPlace, and 3.7 writes down the race between two plug commands: read, filter, write is three steps, it is typed by hand, and it stays a known hole rather than a lock

## 0.4.3 - 2026-09-20

fix: the warn: tripwire sees a delete, a dynamic import and a raw socket

- a generated test that called rmSync, import(), http.request, net.connect or WebSocket printed no warn: line, so the skill ran it unopened
- five more names on the list; it stays short by design, and a false positive costs opening the file

## 0.4.2 - 2026-09-20

fix: plug refuses a root that is itself a store of credentials

- ccsaver plug ~/.ssh was accepted, and because a place is judged from the plugged root down, config and known_hosts then left as ordinary files
- it is the same class of mistake plug already refuses for / and for the home folder, so it refuses the same way
- the secrets-place pattern moved to src/state.ts as isSecretPlace, which boundary already imports and which plug can reach without an arrow that turns back: the check stays inside plug, so the path is still resolved once (rule 3.7)
- only the root's own last segment counts, so a project inside ~/secrets/ still plugs, as the README says it should

## 0.4.1 - 2026-09-20

fix: doctor checks the mode of every file in the state folder

- it checked the state folder and the key, but never plugged or worker.json, which writePrivate writes 600 and which hold the roots you plugged and the host of your worker
- two more permissions lines, labelled "plugged file" and "worker file" so they do not read like the plugged: and worker: findings beside them
- pluggedFile and workerFile are exported from state, so the CLI names no path of its own
- writeHome in the tests writes both files 600, the way the product does

## 0.4.0 - 2026-09-20

build!: Node 24.2 is the floor, the version hook's own requirement

- scripts/version.ts runs on import.meta.main, which Node 24.0 and 24.1 leave undefined: there the git hook of .githooks/ runs, versions nothing and says nothing
- engines, the doctor guard in bin/ccsaver, the README (Requirements and what doctor checks) and CONTRIBUTING 5.3 all say 24.2
- the guard compared the major number alone and let 24.0 and 24.1 through; it now reads the minor as well
- the test drives the guard with a node that reports the version it is given, so 24.1.0 is refused and 24.2.0 runs
- that test took cli.test.ts to 362 lines of the 350 the gate allows, so doctor moved to test/doctor.test.ts with its own state folder

## 0.3.11 - 2026-09-20

fix: the hook asks for the size before it reads the file

- a file over 2 GiB passed the gate: readFileSync refuses one, attempt swallowed it and the read went through as "unreadable" with bytes 0
- past the byte limit the decision is already made, so measure now stats first and reads 8 KB to tell text from binary; on a 300 MB text file peak memory falls from 371 MB to 73 MB and the hook from 0.26 s to 0.05 s (3 runs per arm), inside the 5 s hooks.json gives it
- in that branch the lines were never counted: the deny message says the file was too big to count them and the gate event writes lines: null, instead of claiming zero
- the per-Read cost of an ordinary file did not move: 1.7-1.9 ms unplugged and 21.5-22.4 ms plugged against 1.9 ms and 22.2 ms, two rounds of 30 runs per arm
- the big-file test builds a sparse file whose first 8 KB are text; a sparse file of zeros is binary and passes, which is correct

## 0.3.10 - 2026-09-20

fix: the four failures that used to stay quiet now name their cause

- a fallback killed at 85 s printed "fallback worker could not run: spawnSync claude ETIMEDOUT"; troubleOf reads ETIMEDOUT the way the EPIPE branch reads a child that stopped reading, and says it timed out
- a key that exists but cannot be read (wrong owner, mode 000) was read as no key at all, so the note said "no API key is stored" and doctor said "key: missing" while the call was paid in Haiku; keyIsStored tells the two apart in both places, and the delegate event falls as "key unreadable"
- an adapter the hook cannot load still fails open, as it must, but now leaves a crash event: without it the gate line named the adapter beside limits that were not its own
- bulk-read --target --spec and code-write --question ran and said nothing; parseArgs is handed the options of the mode it was called for, so anything else stops the call
- invokeExternal was the fourth function over cognitive complexity 15, so the reason for a missing key moved into keyless

## 0.3.9 - 2026-09-20

fix: the formatter takes what is left of the budget, not a fixed minute

- the worst case added up to 175 s (30 s of the external worker, 85 s of the fallback, 60 s of the formatter) against the 120 s Claude Code gives a Bash command
- past that the Bash tool kills the process with the target already written and perhaps half formatted, Claude never reads the "wrote ..." line, and a retry hits "refusing to overwrite"
- format now waits min(60 s, 115 s minus what this process has already spent), and never less than 1 s
- the test that added up the waits added up two of the three; it now reads all of them, from both files, and pins that the budget plus the floor stays under 120 s

## 0.3.8 - 2026-09-20

fix: the worker url is printed without its query and refused with userinfo

- doctor printed the full url twice and worker set once, so a key passed as ?key=... (a form some providers suggest) landed in the session's context when either ran inside one
- external, probe and the worker case of main now print origin and pathname; the query is still sent, because some endpoints need it
- writeWorker refuses a url whose username or password is set: fetch rejects one, so until now every call fell through to the paid fallback and doctor called the host unreachable
- isEncrypted counts [::1] as local: the URL class returns that host with its brackets, so the comparison carries them

## 0.3.7 - 2026-09-20

fix: the secrets net catches the places and the tokens it used to miss

- .git/ now counts as a secrets place on the way out: a repository cloned over https://user:token@ keeps that token in .git/config, and every file under .git went to the worker
- .github/ and .gitignore are untouched, and .git stays in PROTECTED_PLACE as well: what may leave and what may be written are two boundaries
- the private-key header matched only when PRIVATE KEY sat against the dashes, so -----BEGIN PGP PRIVATE KEY BLOCK----- went through
- three more token shapes are refused: github_pat_, glpat- and npm_
- test/boundary.test.ts covers each one, with no example token written whole

## 0.3.6 - 2026-09-20

test: the two tests at their line limit split by responsibility

- log.test.ts stood at 349 lines of the 350 the gate allows and worker.test.ts at 345, so the next test in either would have forced the split mid-fix
- log.test.ts keeps the log as a facility (the switch, its permissions, the key it never holds, the 4,000-byte line cap, fail against crash) and events.test.ts takes what the hook and the command record: gate, delegate, doctor, crash
- worker.test.ts becomes bulk-read.test.ts and code-write.test.ts, one flow each
- the readers both copies needed live in test/helpers.ts now: logged, events, between, markOf and systemOf
- CONTRIBUTING 3.6 and 3.7 name the files that hold those guards today

## 0.3.5 - 2026-09-20

docs: the measurement notes move out of the README table

- the "Honest limits" table had grown into a lab notebook, with cells of thousands of characters, and the README sat at 30,416 bytes of the 32,000 the gate allows
- each row now carries its number and its sample size and links to docs/measurements.md, which holds the method and the raw figures
- README: 28,580 bytes

## 0.3.4 - 2026-09-19

docs: the citation check confirmed live on fresh answers

- the numbers in the row came from re-reading the 72 saved answers, so the free worker was called once more to see the check work end to end: 6 answers, the 6 questions that had carried every tag of that wording
- 40 citations, 40 matched, 0 tagged, and each one quotes the line it resolves to; the check as it stood tagged 9 of those same 40, a column written `path:69:7: text` this time
- the run went to a throwaway state folder with the fallback off, so no paid call could happen and the real event log kept its rows

## 0.3.3 - 2026-09-19

fix: the citation check reads the shapes the worker writes, not only the one it asks for

- the worker ends a bullet with `path:line:text` when it can, and with an invented column (`path:69:1:text`), a dangling ` @ ` or the citation written twice when it cannot: the line it points at is right, the shape is not, and each of those counted as a false alarm
- the quote is now read literally first and, only when no line holds it, once more with a leading column and anything from a ` @ ` onwards removed; a citation that ends in the line number again, `path:69:70`, leaves nothing to compare and stays tagged
- measured offline against the 72 saved answers of the 4 wordings, no call spent: on the wording in main, 41 tags of 183 citations become 8, in 3 of the 18 answers instead of 7, the 39 false alarms become 6, and Claude receives 15,106 bytes where it received 15,535
- the other direction is measured too, because tolerating more shapes must not turn a false alarm into a false match: over all 1,193 citations the tags fall from 175 to 77, each of the 1,116 citations the check accepts quotes the line it resolves to, none moved off its line and none was lost
- the literal reading comes first, so a line that itself opens with `20:` is not read as a column; the test fails when the two are swapped

## 0.3.2 - 2026-09-19

fix: bulk-read asks for the path in every citation, also when there is one file

- the instruction said "the way grep -n prints it", and grep -n on one file prints no path: the Haiku fallback cited `line:text`, the check could not read it, and the quoted line reached Claude whole and unchecked
- it now names grep -Hn and says the path goes first even when there is one file; the check itself is untouched
- measured on the Haiku fallback, three single files, 5 calls per file per wording: answers with no readable citation 10 of 15 -> 1 of 15, citations without their path 58 -> 0, bytes that reach Claude 13,551 -> 8,949
- measured on the free worker, 18 answers per wording: the new wording is tagged as often as the old one (41 of 183 against 38 of 278); the false alarms are the worker's own shapes, an invented column above all, and the README row now says so with today's numbers
- a test pins the bulk-read instruction byte for byte, as the code-write one already was

## 0.3.1 - 2026-09-19

fix: the paid fallback asks for no session title, writes a 5-minute cache and has a budget

- One `BARE_ENV` feeds both `--settings` and the child's environment: `MAX_THINKING_TOKENS` lived in one of the two, and the `env` of a settings file wins over the environment (5 → 184 output tokens for a two-character answer, one run each).
- Claude Code titled the session with a second request that carried every file again, and wrote the whole call to a 1-hour cache that a follow-up never read; with the title off and a 5-minute cache the measured 8,230-token call went from 0.0257 $ to 0.0128 $ (Claude Code 2.1.274, subscription login, one run per arm).
- The fallback stops at 85 s, so that its wait and the worker's 30 s fit inside the 120 s a Bash command gets, and at 0.50 $ a call; a spent budget leaves its reason only in the JSON, and the error now names it.
- Every request caps the answer at 8,192 tokens, `doctor`'s probe included, and an answer cut at an output limit falls as `length` and says so.
- A file named twice, by its path and through a symlink, is judged under both names and sent once.
- `doctor` counts the month's delegations that went to paid Claude Haiku, what they cost and why, while the log is on.
- The `code-writer` skill shows one form and always names a `--target`: without one the code came back to be written out a second time.

## 0.3.0 - 2026-09-19

build!: Node 24, the active LTS, is the floor and the toolchain moves with it

- `engines` and the `doctor` guard ask for Node 24: 24 "Krypton" is the active LTS line and 22 "Jod" has been in maintenance since October 2025, so the old 22.18 floor named a version that is no longer the LTS.
- `@types/node` follows the floor at 24.13.5, the newest release past the 24-hour cooldown of `pnpm-workspace.yaml`, rather than the 26 line the registry calls latest: the types describe the oldest runtime the plugin supports.
- CI runs Ubuntu and macOS on Node 24 and 26, with `actions/checkout` v7.0.1, `pnpm/action-setup` v6.1.0 and `actions/setup-node` v7.0.0, each still pinned by commit SHA.
- Biome 2.5.14, TypeScript 7.0.2 and pnpm 12.4.2 were already the latest releases and are unchanged.
- README states the new floor twice, in Requirements and in what `doctor` stops at, and CONTRIBUTING 5.5 states the new matrix.

## 0.2.4 - 2026-09-19

test: the log's 4,000-byte stub and the 8-character floor for scrubbing the key

- A fail whose text runs to 4,200 characters is stored as a stub carrying its byte size, and none of that text reaches the file.
- A stored key under 8 characters is left in place, so text that merely looks like the key survives untouched.
- Each guard was removed in turn to check that its test fails without it.
- test/log.test.ts now measures 349 lines of the 350 the project's own gate allows: the next test there forces a split.

## 0.2.3 - 2026-09-19

fix: the paid fallback runs at the lowest effort level

- The Haiku fallback inherited the session's effort level, measured as max on a session running at max; it now gets low.
- The level is set in the child's environment and in --settings, because Claude Code reads the two separately.
- The fake binary in the test reports the effort it received, so the assertion fails if either path is undone.
- README: the list of what makes the fallback bare now names the effort level.

## 0.2.2 - 2026-09-19

docs: what a pull changes and what claude plugin list keeps saying

- README, Update: ccsaver version follows a pull at once (0.2.0 to 0.2.1 on one commit, measured against GitHub), while claude plugin list keeps the number recorded at install time until claude plugin update, which leaves a 344 KB copy in the plugin cache that no session loads

## 0.2.1 - 2026-09-19

docs: an Update section, the attribution of the usage note, and two README numbers stated as measured

- README, Update: a clone pulls and the next session runs it; a copy installed from GitHub is refreshed with plugin marketplace update and plugin update, and every commit counts because every commit carries its own version
- src/transport.ts takes the attribution header and NOTICE names it: its usage note on stderr is adapted from the bulk-read script of shunt, and it moved there when worker.ts was split
- README, Origin: the framing of the files in the message and the usage note are named with the rest of the adapted material
- README: the 1,987 against 590 input tokens of the fallback are one run each
- README, event log: the 4,000-byte cap is about size; 8 processes appending at once tore 0 lines of 8,000 at 4,000 bytes and 0 of 320 at 1 MB (Linux, ext4), so the 4,096-byte reason is gone

## 0.2.0 - 2026-09-19

feat: every commit is a version, written by a git hook with its changelog entry

- scripts/version.ts, run by .githooks/post-commit and post-applypatch: reads the message of the commit it has just seen, writes the next number into package.json and .claude-plugin/plugin.json, puts the subject and the bullets of the body on top of CHANGELOG.md, and amends that commit with the three files
- feat moves the second number, anything else the third, and a breaking change the first once it is past 0; the number is computed from the parent commit, so an amend never moves it twice
- the hook stays out where git cannot amend (mid cherry-pick or rebase, a git am of several bare patches) and on a merge commit; git rebase --exec 'node scripts/version.ts' versions those commits afterwards
- plugin.json keeps its version in step with package.json, so claude plugin update sees every commit (measured: 0.1.0 to 0.1.1 to 0.2.0); the test that tolerated a manifest without a version now asks for one version in both manifests and on top of the changelog
- the Unreleased section is absorbed by this first automatic version: no section of CHANGELOG.md is written by hand any more
- CHANGELOG.md stays readable whole under the project's own gate (350 lines, 32 KB): the oldest sections fall off the bottom, and git log keeps every one
- test/version.test.ts: one throwaway repository per way of making a commit; the conventions test covers scripts/
- README (Development, Versions), CONTRIBUTING (2.1, 5.1, 5.3), CLAUDE.md

### Fixed

- A `worker.json` that is there but malformed (a stray comma, `"fallback": "false"` in quotes) stops every call with an error. It used to be read as "no worker", which quietly turned `fallback off` back on.
- The Haiku fallback no longer runs your Claude Code hooks (`disableAllHooks`): a `SessionStart` hook measured 1,987 input tokens against 590, and its text reached the worker.
- A worker that has no key stored says so on stderr before the paid fallback answers, and the `fallback off` error names the real reason.
- When the fallback binary exits before it has read a big input (no credit, no login), its own error is reported. Past the 64 KB of a pipe it used to be hidden behind `spawnSync … EPIPE`.
- `doctor` probes with the shape of a real call (same temperature, a system message), so a provider that refuses the real thing fails the probe too.
- `code-write` keeps both fences of a markdown file that starts and ends with a fenced block, and fails instead of reporting a file the formatter removed.
- `bulk-read` checks the citation that follows ` @ `, so a quoted line that holds `path:12:` itself is no longer mangled; a file named twice is sent once; a binary file is refused instead of sent as mojibake.
- The hook counts lines on the bytes (a 300 MB file: 0.37 s and 356 MB instead of 1.0 s and 918 MB), and `offset: null` is no longer a range.
- The stored key is scrubbed from every log line, whether or not the command read it.

### Changed

- The secrets net also looks at the place (`secrets/`, `.ssh/`, `.aws/`, `.gnupg/`, `.kube/`, `.docker/config.json`), at `*.tfvars.json` and at tokens with a well-known shape (`AKIA…`, `ghp_…`, `xoxb-…`, `sk-…`, `AIza…`). `.env.example`, `.env.sample` and `.env.template` go through.
- Event log: `fell` tells `timeout` and `not json` from `unreachable`; a mistake on the command line is a `fail`, never a `crash`; `delegate` carries `risky`; `config` records `worker claude`.
- `--help` prints to stdout, `ccsaver key` without `set` prints the usage, and `worker set` to another host warns that the stored key stays.

### Added

- `ccsaver worker claude <path>|auto` pins the fallback binary, so `worker.json` needs no editing by hand.
- `ccsaver version`.
- A `warn:` line under `wrote …` when the generated code names a shell, the network or the environment, and the `code-writer` skill reads the file before running anything.
- `SECURITY.md`, this file, and a table of the environment variables in the README.
- A logo, `assets/icon.svg`, at the top of the README.
- `CONTRIBUTING.md`, the development rules with the tool that guards each one; a `CLAUDE.md` that points to it; `test/conventions.test.ts` for the rules no other tool checks; `pnpm test` starts from a state folder that does not exist.

## 0.1.0

The per-project read gate, `bulk-read` with checked citations, `code-write` with adapters, the Haiku fallback with its switch, `doctor` and the local event log.

These 17 commits carry this number and no other: the hook that versions every commit landed in 0.2.0, so 0.1.1 to 0.1.16 never existed. Here are their messages, newest first, each under the short hash git log knows it by.

### c1697d0 - 2026-09-19

docs: development rules with their guards (CONTRIBUTING.md, CLAUDE.md) and a conventions test

- CONTRIBUTING.md: 5 sections, 30 rules, each with the compiler switch, Biome rule or test that guards it, or marked convention; the examples cite a file and a symbol of this code
- CLAUDE.md: the always-loaded part, 940 bytes: the spec, the pointer to the rules, the gate and six house laws
- test/conventions.test.ts: zero runtime dependencies, the hook's import list, no cast, function keyword, default export or stray comment, JSON.parse lands in unknown, every throw in src is a Refusal, every file fits under the default gate, every symbol CONTRIBUTING cites exists
- pnpm test starts from a state folder that does not exist, so a test that forgets CCSAVER_HOME cannot touch a real key
- README (Development) points to the rules

### 66d2d8d - 2026-09-19

docs: a logo at the top of the README

- assets/icon.svg is the drawing without its embedded content credentials
  (778 bytes instead of 8,654) and with a <title>, so the lint gate passes
  with no override
- the other four icons stay out of the repository: no documented plugin or
  marketplace field takes an icon, the social preview is uploaded by hand in
  the repository settings, and nothing here serves a favicon
- README: the logo above the title

### 3400a5d - 2026-09-19

chore: type against the oldest supported Node (@types/node 22)

- engines says node >=22.18 and the typings were 26: tsc now refuses an
  API that the oldest supported runtime does not have

### 2f14f2a - 2026-09-19

fix: audit findings — a malformed worker.json stops the call, hook-free fallback, wider secrets net, worker.ts split

- a worker.json that is there but malformed, or carries a field of the
  wrong type, is an error instead of "no worker": a typo can no longer
  turn `fallback off` back on; doctor shows it as `FAIL worker:`
- the Haiku fallback runs with --settings {"disableAllHooks":true}: one
  user-level SessionStart hook measured 1,987 input tokens against 590
  for the same prompt, and its text reached the worker
- a fallback binary that exits before reading a big input (no credit,
  no login) gets its own error reported: past the 64 KB of a pipe
  spawnSync returns EPIPE with status 0 and the real result on stdout,
  and that used to read "could not run"; found while chasing a test
  that failed 15 runs out of 18 under load, 0 of 18 now
- every fall to the paid worker says why: a note when no key is stored,
  `fell` tells `timeout` and `not json` from `unreachable` (doctor's
  probe too), and the fallback-off error names the reason
- a mistake on the command line (unknown option, not a directory, bad
  adapter, malformed worker.json) is recorded as `fail`, never `crash`
- doctor's probe and the real call share requestOf(): same temperature
  and a system message, so a provider that refuses the real shape fails
  the probe
- secrets net: also by place (secrets/, .ssh/, .aws/, .gnupg/, .kube/,
  .docker/config.json, judged from the plugged root down), *.tfvars.json,
  tokens with a well-known shape and binary files; .env.example, .sample
  and .template go through
- `worker set` to another host warns that the stored key stays;
  `ccsaver worker claude <path>|auto` pins the fallback binary, so
  worker.json needs no editing by hand; `ccsaver version`; --help on
  stdout; `key` without `set` prints the usage
- code-write: a `warn:` line under `wrote` when the code names a shell,
  the network or the environment, and the skill reads the file first;
  both fences of a markdown file survive; a target the formatter removed
  is an error
- bulk-read: the citation after " @ " is the one checked, so a quoted
  line that holds path:12: is no longer mangled; a file named twice is
  sent once; the file label is escaped
- hook: lines counted on the bytes (300 MB: 0.37 s and 356 MB, was 1.0 s
  and 918 MB); `offset: null` is no range; one try that records the
  crash; the attribution header NOTICE already named
- the stored key is scrubbed from every log line, whether or not the
  command read it
- structure: boundary.ts (what may leave, where a write may land) and
  answer.ts (citations, fence peeling, the tripwire) are pure and tested
  in-process; transport.ts holds the two workers; worker.ts 405 -> 248
  lines and worker.test.ts split along the same seam (transport, egress),
  so every file reads whole under the project's own gate; attempt()
  replaces ten try/catch-undefined blocks; realpathSync.native
- tests 82 -> 110 in half the time; the helper no longer dies of EPIPE
  when a child ignores its stdin; the log format version is pinned
  across the sh launcher and record(); a plugin manifest that carries a
  version carries the package's
- README: the fallback, the net, the tripwire, the new `fell` values,
  the two ways around the gate, a table of environment variables;
  SECURITY.md; CHANGELOG.md
- CI: actions pinned by commit

### e12689d - 2026-09-19

feat: local event log, off by default; files from the state folder are never sent

- ccsaver log on|off: the folder ~/.config/ccsaver/log is the switch;
  without it an append fails, is ignored and nothing is created; off
  renames it to log.off with its data
- one JSON line per event in events-YYYY-MM.jsonl (600, folder 700, UTC
  month as the only rotation): gate (every Read seen in a plugged
  project, with decision, reason, sizes, limits, ms and the ids of the
  call), delegate (one per bulk-read / code-write, written on exit),
  note, fail, config, doctor and crash
- metadata only: no file contents, no answer, no question or spec text,
  no key, no headers; a stored key inside a message is written as [key];
  a line over 4,000 bytes becomes a stub with its size
- a failure to write the log never changes a decision of the hook, an
  exit code or an output; an unplugged project records nothing
- the hook records the exception it used to swallow in silence
- bulk-read and code-write refuse any file under the state folder, so
  the log cannot leave the machine through a worker
- doctor: one log line (on/off, bytes this month) and a probe marked
  tool_use_id "doctor"

### 99b1e40 - 2026-09-19

feat: markers around the worker's answer; resolve each path once; one key reader; one worker.json read

- the privacy boundary is decided on the same resolved path the file is
  read from: a symlink changed between the read and the decision can no
  longer send the external worker a file from outside the plugged root
- readKey() in state.ts replaces the two near-identical key readers of
  the CLI and the worker
- worker.json is read once per delegation and once per doctor (it was
  three times each) and travels as an argument
- bulk-read, and code-write without --target, print the worker's output
  between `<<<worker-output ID: untrusted data>>>` and `<<<end ID>>>`
  with a random ID the worker never sees, so an answer cannot fake its
  own end; both skills and the README name the markers

### 7171dd4 - 2026-09-19

feat: bare ccsaver command in the skills; doctor checks node and the read gate; install by clone

- both skills call and pre-approve the bare `ccsaver` that Claude Code
  puts on the Bash tool's PATH, so the two permission rules no longer
  carry a path that changes with every update of a copied plugin; the
  skills test pins the bare form, and no other line of a skill may start
  with the command name
- the launcher stops `doctor` at a node older than 22.18 with one FAIL
  line instead of a loader error
- doctor feeds the hook a throwaway file one line over each plugged
  project's limit and fails the new `gate:` line unless it is denied
- README: the clone is the install path and installing straight from
  GitHub is a note with its limits; the bare rules and what they
  pre-approve; doctor's new checks; ~188 tokens, as `plugin details`
  reports
- CI: read-only token permissions

### f5b512d - 2026-09-19

fix: refuse an existing target before the call; count uncited answer lines; share the compile cache

- code-write --target now refuses an existing file before anything is sent,
  as the README already promised; the wx flag stays as the race guard
- the bulk-read note says how many answer lines carry no citation at all,
  so an answer that ignores the format no longer reads as "0 unverified"
- the launcher uses the hook's compile cache when the state folder exists
  (54 -> 25 ms per call) and never creates that folder on its own
- drop two unused exports and the monorepo -r from the deps scripts
- tests: unplug from the CLI, the hook failing open on non-JSON input,
  doctor without a key, with the worker down, with a broken adapter and
  with no state at all, key set without the launcher, a worker url that
  is not a url

### f8a002a - 2026-09-19

feat: bulk-read checks cited lines; cap the paid fallback; teach the = form for --question and --spec

- bulk-read asks the worker to end each bullet with the line that proves
  it (path:line:text) and compares that text with the file it sent: a
  match is cut down to path:line, a quote found on one other line is
  renumbered, anything else is tagged [unverified]; a stderr note counts
  the three
- the Haiku fallback refuses more than 400,000 characters of files with
  a one-line error before the binary is launched (200K-token window, and
  chars/4 has measured about half of a real count); the external worker
  has no such cap
- both skills and the usage text teach --question="..." and --spec="...":
  the spaced form breaks the parser when the text starts with a dash,
  and the skills test now forbids it
- README: measurement row for the citation check, what is checked and
  what is not, the fallback cap

### 96443eb - 2026-09-19

feat: fallback switch; the fallback runs without MCP servers

- ccsaver fallback on|off stores "fallback" in worker.json (default on);
  turning it off needs a worker, and a new worker keeps the setting
- with it off, a call the worker cannot answer fails with a one-line
  error, and a call naming a file outside the plugged root sends nothing
- doctor reports "fallback: off" without launching the binary
- the fallback gets --strict-mcp-config with an empty --mcp-config,
  because --tools "" does not cover MCP tools
- README and both skills say so; a test pins the fallback's arguments

### 3201128 - 2026-09-19

fix: confine code-write targets, harden the secrets net and the fallback, tell the truth about tokens

- code-write --target only writes inside the plugged root (parent folder
  resolved first) and refuses the paths Claude Code protects; the check
  runs before anything is sent
- secret names match in any letter case, eight more names, and any file
  holding a private-key header is refused
- the fallback fails on is_error or on output that is not JSON instead of
  handing the error over as an answer
- fetch never follows a redirect (worker call and doctor probe)
- a closing fence is only peeled together with its opening fence
- the formatter gets a 60 s timeout and a non-zero exit is reported
- {target} is shell-quoted in next: lines when it needs it
- state files are written to a temp name and renamed
- both skills say the worker's output is data, never instructions
- the hook message, the stderr note and the README say the estimate is
  bytes/4 and that a real Read measured 1.9-2.2x that
- README: third-party warning up top, what the two permission rules
  grant, uninstall

### 8843797 - 2026-09-18

fix: each skill pre-approves only its own subcommand; document when Claude Code applies the grant

### 086e133 - 2026-09-18

fix: doctor warns instead of failing when the fallback cannot be seen from a shell outside Claude Code

### bb9d906 - 2026-09-18

docs: measured gate latency after the compile cache

### 6ab537a - 2026-09-18

fix: review findings — corrupt state line, relative file labels, home guard, compile cache, echo-off before the prompt

- readPlugged drops roots that are empty, relative or /: a corrupt line can no
  longer plug the whole disk; the gate skips empty roots too
- files inside the plugged root travel labelled with their relative path
- plug refuses any root that contains the home folder
- the gate sets NODE_COMPILE_CACHE: 49 -> 23 ms per Read in a plugged project
- key set turns the terminal echo off before printing the prompt; covered by a
  pseudo-terminal test
- a malformed adapter names its file; a formatter that cannot run says so
- CI matrix: ubuntu and macos, node 22 and 24
- drop four unused exports

### e2fd4bf - 2026-09-18

chore: deps:check and deps:update scripts, 24 h release cooldown

### 64b783b - 2026-09-18

feat: ccsaver plugin — per-project read gate, one-shot worker, CLI and tests

- hooks/read-gate: POSIX sh gate that only starts node for plugged projects
- src: hook (whole-file read limits), worker (external model with Haiku
  fallback, privacy boundary by real path, secrets filter), state (plugged
  projects, worker, adapters) and cli (plug, unplug, list, worker set, doctor)
- bin/ccsaver: launcher; `key set` reads the key from the terminal, never argv
- skills: bulk-reader and code-writer
- adapters/strict-ts.json: example adapter; private adapters live in the
  state folder
- 48 tests with node --test, no network
