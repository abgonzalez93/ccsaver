# Changelog

Every commit is a version. A git hook writes each section from the commit message, its subject and the bullets of its body ([how](README.md#versions)), and the numbers follow [Semantic Versioning](https://semver.org/). The file keeps the newest versions that fit in 350 lines; `git log` has every one.

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
