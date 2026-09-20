---
description: Turn ccsaver on for this project, or show and undo what is plugged
argument-hint: [adapter]
---

Plugging a project in sends whole files from it to the worker the user configured, a third party. Say that in one line and wait for a yes before running anything.

Then run `ccsaver plug "$CLAUDE_PROJECT_DIR" $ARGUMENTS`. The argument, when there is one, is an adapter name.

Plugging measures the project and prints a `measured:` line: how long its files are, and whether the limit in force fits them. Read that line back to the user. When it proposes a `maxLines`, say that the default is this repository's house style and not a measured optimum, that a limit set too low is what makes a session slower rather than cheaper, and offer to write the adapter that carries it — `<name>.json` in `~/.config/ccsaver/adapters/`, then `ccsaver plug <dir> <name>`. When it says the limit already fits, there is nothing to do.

- `ccsaver list` shows what is plugged in.
- `ccsaver unplug <dir>` takes one back out.
- `ccsaver plug` with no directory plugs the working directory.

The hook and the skills apply from the next session, or after `/reload-plugins`. If `ccsaver` is not configured yet, stop and point at `/ccsaver:setup`.
