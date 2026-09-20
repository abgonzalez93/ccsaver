---
description: Turn ccsaver on for this project, or show and undo what is plugged
argument-hint: [adapter]
---

Plugging a project in sends whole files from it to the worker the user configured, a third party. Say that in one line and wait for a yes before running anything.

Then run `ccsaver plug "$CLAUDE_PROJECT_DIR" $ARGUMENTS`. The argument, when there is one, is an adapter name.

- `ccsaver list` shows what is plugged in.
- `ccsaver unplug <dir>` takes one back out.
- `ccsaver plug` with no directory plugs the working directory.

The hook and the skills apply from the next session, or after `/reload-plugins`. If `ccsaver` is not configured yet, stop and point at `/ccsaver:setup`.
