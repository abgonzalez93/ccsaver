---
description: Write a handoff for a new session, and keep it where the next one can read it whole
---

Write the handoff that lets a session which never saw this conversation continue the work, then keep it with `ccsaver handoff write`. Write it in the language of this conversation, for a reader who knows the domain and nothing of what was said here.

Gather first, from the machine and not from memory: `git status -sb` and `git log --oneline -5` in the project, what the last run of the project's checks said if one ran, and the version if the project has one.

Then write these eight parts, each as short as the facts allow, and none of what the next session already receives on its own (CLAUDE.md, the memory notes, the rules of the repository): cite those by name instead of copying them.

1. **Goal**, and where it stands: done, in progress, not started.
2. **State measured now**: branch, HEAD, what is unpublished, files with uncommitted changes, the last result of the checks, versions.
3. **Decisions taken**, each with its reason.
4. **Discarded**, each with the number or the fact that discarded it.
5. **Next steps**, in order, marking the ones that need the user's word before they run.
6. **Rules that apply**, cited by file and section, not copied.
7. **How to verify**: the exact commands.
8. **Pitfalls paid for** in this session, each with what it cost.

Never put a key, a token or a password in it. Keep it under 350 lines and 32,000 bytes, which is what one whole `Read` takes in a plugged project; 8 to 15 KB is the usual size.

Write the text to a file in your scratchpad, then run:

```bash
ccsaver handoff write < <that file>
```

Read back what it printed: the path where the handoff is kept, private to the user, and the line that opens the next session with it, in a terminal or in a new VS Code conversation. Tell the user both, one line each. If the command refuses the text as too long, cut what the next session can find out on its own and run it again.

`ccsaver handoff` with nothing after it shows whether the warning is on, at how many tokens, and what is kept; `ccsaver handoff off` silences the warning, `ccsaver handoff on` brings it back, and `ccsaver handoff <tokens>` moves the limit.
