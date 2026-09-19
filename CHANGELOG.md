# Changelog

Every commit is a version. A git hook writes each section from the commit message, its subject and the bullets of its body ([how](README.md#versions)), and the numbers follow [Semantic Versioning](https://semver.org/). The file keeps the newest versions that fit in 350 lines; `git log` has every one.

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
