# Changelog

Every commit is a version. A git hook writes each section from the commit message, its subject and the bullets of its body ([how](docs/versions.md)), and the numbers follow [Semantic Versioning](https://semver.org/).

Every version is here, back to the first commit, newest first. Nothing falls off the bottom, so this file has no ceiling: read it from the top, or search it. Nothing before 0.2.0 was numbered one by one, because the hook did not exist yet, so the last section is a single 0.1.0 holding the seventeen commits that make it up.

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
