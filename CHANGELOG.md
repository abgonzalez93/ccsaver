# Changelog

Every commit is a version. A git hook writes each section from the commit message, its subject and the bullets of its body ([how](README.md#versions)), and the numbers follow [Semantic Versioning](https://semver.org/).

This file keeps the newest versions that fit in 350 lines. The older ones are not dropped: the hook files them under [docs/changelog/](docs/changelog/), oldest file first, and no version is ever in two files. Nothing before 0.2.0 was numbered one by one, because the hook did not exist yet, so [docs/changelog/1.md](docs/changelog/1.md) opens with the seventeen commits that make up 0.1.0.

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
