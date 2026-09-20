---
description: Check ccsaver's state folder, key, worker, fallback and plugged projects
---

Run `ccsaver doctor` and report its lines back, shortest first: every `FAIL` with the one command that fixes it, then every `warn`, then one line for the `ok`s.

The usual fixes: `FAIL probe:` is the key or the URL, so `/ccsaver:setup` again; `FAIL key:` on the mode is `chmod 600` on the file it names; `warn plugged:` is a project that moved, so `ccsaver unplug <dir>`.

`warn shape:` means the project's files outgrew the limits the hook denies at. The line ends in the command that fixes it, `ccsaver adapter …`: offer to run it, and say what it changes. Read the `denied:` line beside it first, because it says how often the hook actually fired this month, and a high `shape:` with a low `denied:` means the big files are there but the model rarely reads them. `doctor` asks about that fix itself when a person runs it in a terminal; here there is none, so it only prints, and the command is yours to offer.

Never print the key, and never read `~/.config/ccsaver/api-key`.
