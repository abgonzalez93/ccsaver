# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

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

## 0.1.0

The per-project read gate, `bulk-read` with checked citations, `code-write` with adapters, the Haiku fallback with its switch, `doctor` and the local event log.
