---
description: Check ccsaver's state folder, key, worker, fallback, launcher and plugged projects
---

Run `ccsaver doctor` and report its lines back, shortest first: every `FAIL` with the one command that fixes it, then every `warn`, then one line for the `ok`s. The last line, `12 checks: 10 ok, 1 warn, 1 FAIL`, is the tally and not a check of its own.

The usual fixes: `FAIL probe:` is the key or the URL, so `/ccsaver:setup` again; `FAIL key:` on the mode is `chmod 600` on the file it names; `warn plugged:` is a project that moved, so `ccsaver unplug <dir>`; `warn permissions:` names a `Bash(ccsaver …)` rule missing from `permissions.allow` in the user's `settings.json`: show the two rules the README asks for and never edit that file yourself; `warn launcher:` is `ccsaver launcher write`, which `doctor` offers itself on a terminal; `warn path:` names a line for the user's shell profile, or a `ccsaver` of theirs that comes first on the `PATH`: show it, and never edit a profile.

`warn shape:` means the project's files outgrew the limits the hook denies at. The line ends in the command that fixes it, `ccsaver adapter …`: offer to run it, and say what it changes. Read the `denied:` line beside it first, because it says how often the hook actually fired this month, and a high `shape:` with a low `denied:` means the big files are there but the model rarely reads them. `doctor` asks about that fix itself when a person runs it in a terminal; here there is none, so it only prints, and the command is yours to offer.

Never print the key, and never read `~/.config/ccsaver/api-key`.
