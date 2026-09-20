---
description: Add up the event log and say what ccsaver cost against what it would have cost
argument-hint: [month|all]
---

Run `ccsaver saved $ARGUMENTS` and read its lines back. No argument means the month in course; a `YYYY-MM` names one month, `all` sums every month the log still holds.

**Never report a single number.** Every figure is a band, because a real `Read` measured 1.9–2.8× the bytes/4 estimate the hook counts with. Say the range, or say the percentage, which barely moves across the band and is the sturdier of the two. "It saved between $9.69 and $14.43, so 93–94 %" is the report; "it saved $14.43" is not.

Read `instead` aloud beside `denied`, always. A denied read is not a saving on its own: the model then reads the file by ranges and pays for those, and `instead` is what that cost. A summary that gives `denied` without `instead` is the one way this command can lie.

Carry back every line the foot prints, because each one is a limit on the number above it:

- *nothing here replaced those reads* — the log has denials with nothing recorded against them, so `without` is the most flattering reading there is. Say so plainly.
- *N of M external calls reported no usage* — those were counted at chars/4, not at what the endpoint charged.
- *the gate watches the Read tool only* — a `Grep` or a `cat` that replaced a denied read is in neither column, so the comparison is narrower than it looks.
- *neither column holds what the session read back* — the denial messages and the worker answers the session itself paid to read are counted there and left out of both columns, so the true `with` side is higher than the bar shows.

A band that crosses zero is an answer too: say that the month may have cost more than it saved and that the data cannot tell which, never round it to a win. A negative saving is a real answer, not an error: report that the delegations cost more than the reads they replaced, and suggest raising the limits with `ccsaver adapter <name> maxLines=<n>` (a limit set too low is what makes a session slower rather than cheaper) or `ccsaver fallback off`.

`no model here has a price` means it can only count tokens. A price belongs to one model, in dollars per million **input** tokens:

```bash
ccsaver price claude-opus-5 5.00   # whichever model the report names
ccsaver price worker 0.10          # the cheap worker
```

`ccsaver price` with nothing after it lists what is already set. The report names every model it saw and singles out the ones with no price, whose tokens it leaves out of the sum. Read those lines back and offer to set each one. **Ask the user for the number rather than guessing it**: a price you invent makes every figure below it fiction, and it is the one thing here that cannot be measured from the machine. Point them at Anthropic's pricing page for the session models and at their provider's for the worker.

`the log is off` means there is nothing to add up. `ccsaver log on` starts recording, metadata only and on this machine alone ([what it holds](../docs/events.md)) — and say that it records from that moment, so there is nothing to read until the plugin has done some work.

There is no minimum: the bars come out from the first denied read. Read the `denied` and `delegated` counts back before the percentage — a band drawn from two reads is worth what two reads are worth, and saying so out loud is your job, not the report's.
