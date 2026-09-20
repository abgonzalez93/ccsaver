---
description: Check ccsaver's state folder, key, worker, fallback and plugged projects
---

Run `ccsaver doctor` and report its lines back, shortest first: every `FAIL` with the one command that fixes it, then every `warn`, then one line for the `ok`s.

The usual fixes: `FAIL probe:` is the key or the URL, so `/ccsaver:setup` again; `FAIL key:` on the mode is `chmod 600` on the file it names; `warn plugged:` is a project that moved, so `ccsaver unplug <dir>`.

Never print the key, and never read `~/.config/ccsaver/api-key`.
