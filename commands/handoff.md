---
description: Write a handoff for a new session, and keep it where the next one can read it whole
---

Write the handoff that lets a session which never saw this conversation continue the work, then keep it with `ccsaver handoff write`. Write it in the language of this conversation, for a reader who knows the domain and nothing of what was said here.

Gather first, from the machine and not from memory, with three commands and no other tool: `git status -sb`, `git log --oneline -5` and `git describe --tags --always` in the project; what the last run of the project's checks said, if one ran, is already in this conversation.

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

Hand the text to `ccsaver handoff write` on its stdin, in the same Bash call, through a quoted heredoc and no file in between:

```bash
ccsaver handoff write <<'HANDOFF'
# Handoff · <the work> · <the date>
…
HANDOFF
```

Read back what it printed: the path where the handoff is kept, private to the user, and, as its last line, the line that opens the next session with it. Tell the user the path in one line, then end the turn with that last line copied as it is, alone in a code block, nothing after it: it works pasted in a terminal session and typed in a new VS Code conversation. If the command refuses the text as too long, cut what the next session can find out on its own and run it again.

`ccsaver handoff` with nothing after it shows whether the handoff point is on, at how many tokens the session hands off, and what is kept; `ccsaver handoff off` turns it off, `ccsaver handoff on` brings it back, and `ccsaver handoff <tokens>` moves the limit.
