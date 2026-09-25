# The handoff

Every request of a session carries the whole conversation, so a long session pays for its history on every turn, and a session that grows past what you allow costs you on every request after that. ccsaver keeps a session under a limit you set: at a point under it, the session stops the work, writes the handoff that lets a new session continue, keeps it where that session can read it whole, and ends the turn with the line that opens it. Nothing asks you to do anything; you paste one line.

## The limit, the margin and the point

- **The limit** is yours: `ccsaver handoff <tokens>`, 200,000 by default. The count it applies to is the size of the context after the last response of the session, `input_tokens + cache_creation_input_tokens + cache_read_input_tokens + output_tokens` of the last assistant line of the session transcript: the sum the status line shows as context usage, plus the response just given, which the next request carries.
- **The margin** is ccsaver's, 80,000 tokens, a constant with [a measure behind it](notes/measurements.md#where-the-handoff-margin-comes-from) and not a setting: what the context can still grow by between the last count the hook can act on and the end of the turn that writes the handoff, in the sessions measured.
- **The point** is the difference, 120,000 tokens by default. `ccsaver handoff` says all three: `handoff on · limit 200000 tokens · hands off at 120000 (margin 80000) · …`, and `doctor` prints `handoff: on · 200000 tokens · hands off at 120000`. A limit at or under the margin is refused, because it would leave no room to work in.

## What the hook does

One hook, `hooks/gate handoff`, runs `src/handoff.hook.ts` from three events of Claude Code, in a plugged project only, and `hook_event_name` decides:

- **On every tool call** (`PreToolUse`, every tool). Below the point, nothing. Near it, a batch of parallel calls is cut: the calls of one response are numbered in the order the response made them, and the i-th passes only while the count plus i × 8,000 stays under the point; the rest are denied with `this batch was cut to N calls; call the rest again, fewer at a time`, and one `held` line goes to the [event log](events.md). At the point, the first call is denied with the request itself: the model, the count, the point and the limit, followed by the text of `commands/handoff.md`, so the session writes the handoff without invoking the skill or asking for a permission, and you see one line: `ccsaver: handing off at N tokens, the L limit`. From then on only what the handoff needs passes: the `Skill` `ccsaver:handoff`, and a `Bash` command that starts with `git status`, `git log`, `git describe` or `ccsaver handoff write`; every other call is denied in one line that says so.
- **At the end of a turn** (`Stop`). A turn that ends in text at the point, with no tool call to deny, gets the same request as context, and the session continues into the handoff, unless Claude Code is already continuing because of a stop hook (`stop_hook_active`), in which case the hook never asks. Once the handoff is written, the end of that turn records `done` with the final count, and nothing else happens.
- **On every prompt** (`UserPromptSubmit`). Once the handoff is written, the prompt is not processed and you are shown the line to paste: `ccsaver: this session was handed off at N tokens, the L limit. Paste this in a new session: Read <path> whole, then continue from its next step. ccsaver handoff <tokens> raises the limit; ccsaver handoff off unlocks this session.` A prompt typed at the point before anything was asked goes through with the request beside it, and the session writes the handoff instead of attending to it: paste the prompt again in the new session.

A subagent's tool calls come with an `agent_id` and are left alone: their results land in the subagent's context, not the session's, and only the report comes back.

The transcript is written behind the conversation, [as Claude Code documents](https://code.claude.com/docs/en/hooks), so the line the hook needs may not be there yet when the event fires. On a tool call the hook waits, fifty milliseconds at a time and two seconds at most, for the line that holds its own `tool_use_id`; at the end of a turn, for a last line that ends the turn and was written in the last two seconds. When the line does not land, the hook decides with the line before it, one step behind, which is what the margin is for.

## The states of a session

- **none**: no marker. Every event passes, except a batch cut near the point.
- **asked**: `handoff/<session>.asked` (600, folder 700) holds the count the hook read when it asked. Only the handoff's own commands pass.
- **written**: `handoff/<session>.md` is newer than the marker. Every tool call is denied with the line to paste, every prompt is answered with it, and the first end of turn records `done`.

A count back under the point, after a compaction or after `ccsaver handoff <tokens>` raised the limit, clears the marker and starts over from **none**; a new crossing asks for a new handoff, and `write` replaces the kept one. Markers of other sessions older than seven days are swept whenever one is written; kept handoffs never are. Without a session id, or with a transcript that is missing, unreadable, or written in a shape the hook does not know, every event stays silent, with no `crash`: the format is Claude Code's own and may change on any release, and a hook that fails must fail open.

## The skill and the command

`/ccsaver:handoff` has the session write the handoff, in the language of the conversation and for a reader who never saw it: the goal and where it stands, the state measured now, the decisions and their reasons, what was discarded and by which number, the next steps and where they need your word, the rules that apply cited by name, how to verify, and the pitfalls paid for. It gathers with three commands, `git status -sb`, `git log --oneline -5` and `git describe --tags --always`, and hands the text to `ccsaver handoff write` on stdin through a quoted heredoc in the same call, so nothing is written to disk first. `write` keeps the text in `handoff/<session>.md` (600), one per session, so a second one written in the same session replaces the first and says `replaced`; refuses one that would not fit a whole `Read`, 350 lines or 32,000 bytes; and prints the path, the line that opens the next session in a terminal, `claude "Read <path> whole, then continue from its next step"`, and, as its last line, that same line bare, which the session copies into a code block as the last thing of its turn. It works pasted in a terminal and typed in a new VS Code conversation. `ccsaver handoff` names the latest one kept. Handoffs are never deleted for you; the `rm -rf` of [Uninstall](../README.md#uninstall) takes them too.

The skill works by hand too, below the point, whenever you want a session to hand over.

## Settings

- `ccsaver handoff off` turns the whole thing off, `ccsaver handoff on` brings it back, `ccsaver handoff <tokens>` moves the limit, and `ccsaver handoff` alone says what is set and what is kept. On is the default and needs no file: `handoff.json` (600) is written on the first change. One that is there but malformed or unreadable stops each of these with its name and leaves the hook silent with a `crash` in the [event log](events.md), never read as the default. Typed with the value in force, each answers `already` and writes nothing.
- Off costs what an unplugged project costs: `hooks/gate` reads the switch in `sh` before Node starts, the way it reads `plugged`, whether `ccsaver handoff off` wrote the file or a hand did, as long as `"on"` and `false` share a line.
- The automatic route runs `git status`, `git log`, `git describe` and `ccsaver handoff write` through `Bash`. Where Claude Code asks before a command, it asks for those too; a rule `Bash(ccsaver handoff write *)` beside [the two of the skills](../README.md#what-the-two-permission-rules-grant) lets the handoff through without a question, and the three `git` commands read and write nothing.

## What it costs, and what it does not promise

Below the point, a tool call and a prompt are answered in `sh`, before Node starts, and the end of a turn pays Node's start-up as before; the crossing pays Node once, with the request: the numbers are in [The handoff hook per event](notes/development.md#the-handoff-hook-per-event).

The margin covers the biggest step [measured](notes/measurements.md#where-the-handoff-margin-comes-from), not the biggest possible: Claude Code caps one response at 128,000 tokens on the models the sessions ran, and a batch of parallel tool results at nothing, so a step larger than every one in 12,273 requests could still end a session past the limit. The count is what a file of Claude Code's own says, in a format that changes between versions: on a release that changes it, the hook falls silent, never wrong. And the hook never names the model's window, because the transcript does not, which is why the limit is a count and not a percentage.
