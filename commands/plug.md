---
description: Turn ccsaver on for this project, or show and undo what is plugged
argument-hint: [adapter]
---

Plugging a project in sends whole files from it to the worker the user configured, a third party. Say that in one line and wait for a yes before running anything.

Then run `ccsaver plug "$CLAUDE_PROJECT_DIR" $ARGUMENTS`. The argument, when there is one, is an adapter name.

Plugging measures the project and prints a `measured:` line: how long and how heavy its files are, and whether the limits in force fit them. Read that line back to the user. When the limits fall short, the line ends in the command that fixes it, `ccsaver adapter <name> maxLines=<n> …`, sometimes followed by a second `ccsaver plug` because an adapter nothing points at changes nothing. Offer to run it, and say what it changes: the defaults are this repository's own house style and not a measured optimum, and a limit set too low is what makes a session slower rather than cheaper. When it says the limits already fit, there is nothing to do.

- `ccsaver list` shows what is plugged in.
- `ccsaver unplug <dir>` takes one back out.
- `ccsaver plug` with no directory plugs the working directory.

The measurement is taken once, here. Nothing re-measures on its own: the hook never walks the project, because it runs on every `Read` and has 24 ms to answer. So tell the user, in one line, that a repository's files grow and that `/ccsaver:doctor` re-measures and says when the limits no longer fit — worth running when the project has changed shape, not on a schedule.

The hook and the skills apply from the next session, or after `/reload-plugins`. If `ccsaver` is not configured yet, stop and point at `/ccsaver:setup`.
