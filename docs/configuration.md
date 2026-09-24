# Configuration

Everything `/ccsaver:setup` asks for, and the fine print behind it. The [README](../README.md) is the short version.

`/ccsaver:setup` walks a session through all of it and ends with `doctor`. `ccsaver setup` does the same from a shell, once [that shell can find it](#your-own-terminal). These are the subcommands behind them:

```bash
ccsaver worker set https://your-provider.example/v1/chat/completions some-small-model
ccsaver key set                             # see below: never an argument
ccsaver doctor
ccsaver fallback off                        # optional: never spend on the Claude Haiku fallback
ccsaver worker claude ~/.local/bin/claude   # optional: pin the binary the fallback runs
```

## Your own terminal

Claude Code puts a plugin's `bin/` on the `PATH` of the Bash tool of its own sessions and nowhere else, and runs nothing of a plugin's when it installs one ([plugins reference](https://code.claude.com/docs/en/plugins-reference)), so after the install a terminal of yours answers `ccsaver: command not found`. The slash commands need nothing more. For the commands, `ccsaver launcher write`, which `setup` runs, puts a launcher at `~/.local/bin/ccsaver`, where the native installer keeps `claude` itself, so a terminal that runs `claude` already looks there, and Debian's and Ubuntu's `~/.profile` adds it at the next login once it exists. When the folder is not on the `PATH` the command prints the one line to add to your shell profile, never edits it, and never replaces a `ccsaver` it did not write.

The launcher is a script, not a symlink, because the folder Claude Code installs into carries the version in its name. On each call it reads the installed version from Claude Code's record, `installed_plugins.json` under `CLAUDE_CONFIG_DIR` or `~/.claude`, and runs that one, never the newest folder in the cache: an uninstalled plugin stays on disk for about 14 days, and the launcher then says `ccsaver is not installed` and exits 1. The record is undocumented: a shape it does not know stops it, naming the file. Inside a session it steps aside for the `bin/` the session loaded, so a skill runs the version its session carries, at [2 ms; a terminal pays 16 ms](measurements.md#the-terminal-launcher). `rm -f ~/.local/bin/ccsaver` removes it ([Uninstall](../README.md#uninstall)).

## The worker

Any OpenAI-compatible chat completions endpoint works.

- The URL must be `https`, or `http` to `localhost`, `127.0.0.1` or `[::1]`. Any other scheme is refused as you set it, because `fetch` cannot use one: a stored `ftp://localhost/…` would have sent every call to the paid fallback under a message blaming the host.
- A url that carries a user name or a password (`https://me:token@…`) is refused as you set it. `fetch` rejects one outright, so every call would have fallen to the paid worker under a report that blamed the host.
- A query string is kept, because some endpoints need one, and never printed: `worker set`, `doctor` and a failing probe show origin and path only, so a key passed as `?key=…` stays out of the session's context.
- A redirect from the worker counts as a failure, never followed with your file in hand, and is named as one.
- Every request caps the answer with `max_tokens`: 2,048 tokens for `bulk-read`, because an answer in bullets never needs more and a longer one would not fit the ~30 KB the Bash tool shows inline, and 8,192 for `code-write`; a provider's own default never decides, an answer cut at either limit says so before it falls back, and a body past 4 MB counts as no answer.
- The answer is read whether the endpoint puts it in `choices[0].message.content` as a string or as a list of text parts, which some do for a model that reasons first: an unknown shape used to count as no answer and spend the fallback.

Without a worker, or whenever it fails, times out (30 s: the slowest real call measured took 19 s) or cuts its answer short, the call goes to Claude Haiku through your own Claude Code binary: the one the session runs on (`CLAUDE_CODE_EXECPATH`, an undocumented variable observed in Claude Code 2.1), then `claude` on your `PATH`.

`ccsaver worker claude <path>` pins another binary, which wins over both, and `ccsaver worker claude auto` unpins it. Only pin a path that survives updates: the IDE extensions keep their binary in a versioned folder.

Every fall to the paid worker says why on stderr first, a worker that has no key stored included. A key that is there but cannot be read (wrong owner, wrong mode) is named as that, never reported as no key at all. So is a key that carries a character no HTTP header can take, a line break, an accent, a typographic quote that came with a paste: `fetch` refuses to build that request, so nothing is sent, and reading that refusal as a dead host used to blame your provider while every call went to the paid fallback. `doctor` fails the `key:` line with the same words and never reaches the probe. A fallback that runs out of its 85 s says so instead of printing `spawnSync claude ETIMEDOUT`. When the fallback itself reports an error, the command fails with that error instead of handing it over as an answer.

`worker.json` needs no editing by hand. If it is there but malformed (a stray comma, `"fallback": "false"` in quotes, a key it does not know such as `"fallbck"`), every call stops with a one-line error and nothing is sent: a typo is never read as "no worker" nor a misspelt switch as one left out, because either would quietly turn `fallback off` back on. `prices.json` is read the same way. One that is there but cannot be read (wrong owner, wrong mode) stops the call the same way and says so, for the same reason, and `doctor` would otherwise report a worker you configured as one you never had. `worker set` to a different host sets the stored key aside as `api-key.moved` and says so: until `ccsaver key set` stores the key of the new host, every call fails with that line and sends nothing anywhere, and `doctor` fails its `key:` line the same way.

## The key

**The key never travels as an argument.** On a terminal `ccsaver key set` asks for it with the echo off. Everywhere else it reads one line from stdin, so from inside Claude Code you save the key in a file only you touch and let it be read without ever being shown:

```bash
ccsaver key set < ~/my-key.txt && rm ~/my-key.txt
```

`/ccsaver:setup` walks that path and is told not to read the file. Nothing about the key reaches the session: not the command line, not the transcript, not the event log, which records the bare fact of a `key set`.

## The fallback

The fallback spends your Claude usage, so it is as bare as the worker: no built-in tools, no MCP servers, none of your hooks, no thinking, no session title and the lowest effort level (`--tools ""`, `--strict-mcp-config`, `disableAllHooks`, `MAX_THINKING_TOKENS=0`, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`, `CLAUDE_CODE_EFFORT_LEVEL=low`), whatever your Claude Code has configured. A session running at `max` does not drag the fallback up with it.

Every one of them is set both in the child's environment and in `--settings`, because the `env` of a settings file wins over the environment: with `MAX_THINKING_TOKENS=0` in the environment alone and 4,000 in a settings file, a two-character answer took 184 output tokens instead of 5 (one run each).

Left alone, Claude Code titles the session with a second request that carries every file again, and on a subscription login writes the whole call to a 1-hour cache at twice the input price that no follow-up reads, because files and question travel as one block. The fallback turns the title off and asks for the 5-minute cache (`CLAUDE_CODE_PROMPT_CACHE_TTL=5m`), which took [the measured call](measurements.md#the-haiku-fallback-on-one-8230-token-call) from 0.0257 $ to 0.0128 $.

One user-level `SessionStart` hook measured 1,987 input tokens against 590 for the same one-line prompt (one run each), its text landing in the worker's context: hence `disableAllHooks`.

It is bounded as well:

- 85 s, so that the worker's 30 s and the fallback's fit inside the 120 s Claude Code gives a Bash command.
- 0.50 $ a call (`--max-budget-usd`), which stops the retries Claude Code makes on its own when an answer hits an output limit (4 turns measured against a 200-token limit).
- 400,000 characters of files per call: Haiku's window is 200,000 tokens and chars/4 has measured about half of a real count, so a bigger call fails with a one-line error before anything is spent; the external worker's limit is your provider's.

`ccsaver fallback off` turns it off once a worker is set: a call the worker cannot answer then fails with a one-line error and Claude reads by ranges instead, and a call that names a file outside the plugged root sends nothing anywhere. The switch is read again at the moment of falling, so an `off` typed while a call waits on the worker still holds for that call. `ccsaver fallback on` brings it back. Both refuse until there is a worker, because the switch lives in `worker.json` and without one the fallback is the only worker: a confirmation for a setting never stored would be a lie. So does `ccsaver worker claude`, and all three name `ccsaver worker set <url> <model>` in the refusal. Typed with the value already in force, each of them says so, `the fallback is already on`, `the fallback binary is already pinned: <path>`, and writes nothing: on is the default, so a fresh `worker.json` answers `fallback on` that way and stays as it was. Every confirmation carries what the switch means, `a call the worker cannot take goes to paid Claude Haiku` or `fails instead`, so the word `on` never stands alone.

Claude Code's documentation says `--bare` will become the default for `-p`, and bare mode does not use a subscription login: on a future version the fallback may need an `ANTHROPIC_API_KEY`.

## doctor

`doctor` stops at a `node` older than 22.18, and at the 23 line and a 24 under 24.2, and then checks, in order:

- The permissions of the state folder and of every file it keeps there: the key, `plugged` and `worker.json`, all 600, plus `prices.json` at 600 and your own `adapters/` at 700 once either one exists — a folder made by hand is world-readable, and the adapters in it carry your house style. Stricter passes: what the check asks is that you can read them and nobody else can, so a key you set to 400 is `ok` and the line shows the mode it found. The log is the exception, because the hook appends to its files: its folder must be 700 and its files 600.
- Whether the [event log](events.md) is on and how many bytes this month's file holds, a file it cannot read being a `FAIL` of its own rather than the end of the report, and while it is on, how many whole-file reads the hook denied this month and their median length (`denied:`), and how many delegations went to paid Claude Haiku, what they cost and why (`spent:`).
- The worker, with a probe shaped like a real call: same temperature, the `max_tokens` of a `code-write`, a system message, so a provider that would refuse the real thing fails here. 200 = the key works, 401/403 = rejected, 400 = the key or the request rejected, which is what Google answers to a wrong key, and a timeout is told from a host that cannot be reached. A `worker.json` it cannot trust fails the line.
- The fallback binary, with `--version`, unless the fallback is off.
- Every plugged project, with its adapter and limits. For each one it writes a throwaway file one line over the limit inside the root for a moment, feeds it to the hook, and the `gate:` line fails unless that read is denied.
- The shape of every plugged project, measured again on each run. A `warn shape:` line appears only when the project has outgrown its limit; see [Limits](#limits).
- The launcher of [your own terminal](#your-own-terminal): that it is ccsaver's, which version it runs, and whether its folder is on the `PATH`, naming a `ccsaver` that comes first.

It never prints the key, its length or the query of the worker url. From a terminal outside Claude Code with no `claude` on the `PATH`, the fallback line is a `warn`, not a failure: that shell cannot see the binary a session brings, so run `doctor` from inside one.

The last line, after a blank one, is the tally, `12 checks: 10 ok, 1 warn, 1 FAIL`: it is not a check of its own, and the exit code follows it, 1 when anything failed and 0 otherwise. On a terminal each line opens with a mark in the colour of its level, `✓`, `!` or `✗`, and the tally with the mark of the worst level in it; the words `ok`, `warn` and `FAIL` are always there beside them, so the report reads the same through a pipe.

Whether the plugin itself is enabled is Claude Code's to say: `claude plugin list`. `ccsaver version` prints the version you are running.

## Adapters

An adapter is a small JSON file with what is specific to one project. ccsaver looks for `<name>.json` in `~/.config/ccsaver/adapters/` first and in this repository's `adapters/` second, so your project's adapter can stay private. A name takes lowercase letters, digits and dashes, starting with a letter or a digit; anything else is refused with the name it read back.

```json
{
  "rules": "house style the writer must follow, appended to its instruction",
  "format": ["node_modules/.bin/biome", "check", "--write"],
  "after": ["node_modules/.bin/biome check {target}"],
  "maxLines": 350,
  "maxTokens": 8000
}
```

Every field is optional. `format` runs from the project root with the written file appended. A bare name (`biome`) is looked up on your `PATH`; a path, relative or absolute, runs only when it resolves inside that root, and one that does not (`../tools/fmt.sh`, `/opt/tools/fmt`) is not run at all: the line says so and the file is left unformatted, because the one command ccsaver runs without asking must not be reachable from outside the project. It runs for at most 60 s and never past what is left of the 115 s the command gives itself inside the 120 s of a Bash call, keeping at least 1 s, and may print at most 1 MB; it runs with a bare environment, `PATH`, `HOME`, `LANG` and `TMPDIR` only; a failing formatter is reported with its exit code and the first 400 characters it wrote to stderr, which reach the session and never the log, not fatal; `after` lines are printed as `next:` commands for the model to run, with `{target}` replaced by the absolute path, shell-quoted when it needs it, so do not add quotes of your own; `maxLines` and `maxTokens` move the hook's thresholds, which [Limits](#limits) covers. [`adapters/strict-ts.json`](../adapters/strict-ts.json) is a working example, and what its `rules` are worth carries [its own note](measurements.md#the-rules-of-an-adapter): they reach the worker and change what it writes, 3 runs of 4 against 0 of 4, while the import they were once credited with came out right with them and without them.

## Limits

Two numbers decide what the hook denies: `maxLines`, and `maxTokens`, which counts bytes/4. A whole-file `Read` past either one is denied when the file is inside the plugged root and `bulk-read` would take it. One outside the root is never denied, because no skill could take it; one `bulk-read` would refuse, a secrets file by name or place, one holding a private key or an access token, or a binary its first 8 KB did not reveal, is let through with the reason `untakeable` in [the event log](events.md), because a denial nothing can delegate only costs a request. A file past the byte limit is never opened to count its lines, only, when it is about to be denied, to see whether it holds a secret, and past 1 MB not even for that: its name and its place are still checked, its text is not, so it is denied unread, as every file past the byte limit was before, unless it is named or placed like a secret. The defaults are 350 lines and 8,000 tokens, which is this repository's own house style rather than a measured optimum: delegation [starts to pay](measurements.md#where-delegation-starts-to-pay) at roughly 2,000 lines, so below that a denial is a nudge towards Grep or a ranged read, and a saving only when the model then lets the file go ([what a denial costs after the message](measurements.md#what-a-denial-costs-after-the-message)).

The two ways of being wrong do not cost the same. **Too high is inert**: the hook stops firing and you have what you had without the plugin. **Too low degrades the session**: the model pays for the denial, then pages through ranges it picked from Grep, and ends up reasoning over fragments. That is the [3.6× row](../README.md#honest-limits). Err high.

The right numbers belong to the repository, so `ccsaver plug` measures them. It walks the project, skipping `node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `.venv`, `venv`, `__pycache__`, `coverage`, `.next`, `.turbo`, `out`, `.cache`, `.gradle` and `Pods`, never following a symlinked directory, reads the first 8 KB of each file to leave the binary ones out and counts a file that ends inside those 8 KB from them rather than reading it twice, skips anything past 1 MB, measures at most four thousand files and takes one in N when there are more, saying so in the line, and reports the length and weight 19 files in 20 stay under:

```
plugged /home/you/project · adapter none
measured: 67 of 67 files, 19 in 20 under 285 lines and 3237 tokens, which the 350-line, 8000-token limits already fit
```

When either one is over the limit in force, it names the replacement, rounded up to fifty lines or a thousand tokens, and names only the one that fell short:

```
measured: 334 of 933 files, 19 in 20 under 396 lines and 4907 tokens: the limits in force deny normal files here. To fit them, run: ccsaver adapter my-app maxLines=400 && ccsaver plug /home/you/my-app my-app
```

Both limits are measured because both deny, and a file can need both raised: a 1,058-line test file of 41 KB is over both, so moving one alone leaves it denied by the other.

The proposal never falls below the defaults, because ten short files would otherwise argue for a limit far worse than 350, and under twenty countable files it refuses to judge: one file in twenty is not a number.

The measurement is taken at `plug` and at every `doctor`, and nowhere else: the hook never walks the project, because it answers every `Read` inside 24 ms, so a repository that grows past its limits says nothing until someone runs `doctor` again; nothing is stored between runs, so the answer is always that day's.

`doctor` measures again on every run and adds one `warn shape:` line per project that has outgrown its limits, which is the moment the hook starts denying files the model should read whole. It is never a `FAIL`: nothing is broken, the limits are no longer the right ones. Growth the other way needs no warning: a limit nothing reaches is inert.

To move them, put them in an adapter. `plug` and `doctor` end their line with the command that does it:

```bash
ccsaver adapter vellum maxLines=400 maxTokens=8000
```

It writes `~/.config/ccsaver/adapters/<name>.json` at 600, in a folder it puts back to 700 on every write, because a hand that made it first leaves it readable by everyone, creating the file or merging into it, so an adapter that carries `rules` and `format` keeps them; a pair it already holds, `adapter <name> already holds maxLines=400, nothing changed`, leaves the file untouched. It takes `maxLines` and `maxTokens` only, both positive integers up to a million, far past the 2,850 lines the widest corpus measured asked for and low enough that an extra zero cannot make `doctor` write a gigabyte of throwaway file or the hook read one into memory; a pair it cannot take is named back rather than answered with the usage, and every other field is edited by hand. An adapter that is there but malformed, or that cannot be read, stops the command instead of being written over, the same way `worker.json` does: the file that carries your `rules` and your `format` is never replaced by one that carries a limit and nothing else. A project with no adapter gets a second command beside the first, `ccsaver plug <root> <name>`, because an adapter nothing points at changes nothing, with the root quoted for the shell when it holds a space or anything else a shell would read; the name is made from the folder, lowercased with everything an adapter name cannot hold turned into `-`, so `~/code/My_App` proposes `my-app`.

On a terminal `doctor` offers to run it, one `warn` at a time, reading your whole answer before judging it, so a long one never spills into the next question.

While the [event log](events.md) is on, `doctor` also prints a `denied:` line: how many of this month's whole-file reads the hook actually denied, and the median length of the ones it did. That is the measured answer beside the predicted one, and the two disagree in a useful way — a project can hold long files the model never reads.

## The handoff warning

Every request of a session carries the whole conversation, so a long session pays for its history on every turn. ccsaver watches the size of that history, says when it is time to hand the work to a new session, and has the session write the handoff itself.

The hook runs at the end of every turn, in a plugged project only, and reads the last 256 KB of the session transcript for the token count Claude Code writes with each response, `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, the sum the status line shows as context usage. Once that count passes the limit, 200,000 tokens by default, the turn ends with a warning that names the model, the count and the limit and points at `/ccsaver:handoff`. It comes again each time the count passes another multiple of the limit, never in between, and a compacted session, whose count falls back, starts over. It never names the model's window, because the transcript does not, which is why the limit is a count and not a percentage.

- `ccsaver handoff off` silences it, `ccsaver handoff on` brings it back, `ccsaver handoff <tokens>` moves the limit, and `ccsaver handoff` alone says what is set and what is kept. On is the default and needs no file: `handoff.json` (600) is written on the first change. One that is there but malformed or unreadable stops each of these with its name and leaves the hook silent with a `crash` in the [event log](events.md), never read as the default. Typed with the value in force, each answers `already` and writes nothing.
- Off costs what an unplugged project costs: `hooks/gate` reads the switch in `sh` before Node starts, the way it reads `plugged`.
- The hook keeps one marker per session, `handoff/<session>.tier` (600, folder 700), with the last multiple it warned at, and sweeps markers older than seven days whenever it writes one. Without a session id it stays quiet.
- A transcript that is missing, unreadable, or written in a shape the hook does not know leaves the turn in silence, with no `crash`: the format is Claude Code's own and may change on any release.

`/ccsaver:handoff` has the session write the handoff, in the language of the conversation and for a reader who never saw it: the goal and where it stands, the state measured now, the decisions and their reasons, what was discarded and by which number, the next steps and where they need your word, the rules that apply cited by name, how to verify, and the pitfalls paid for. It hands the text to `ccsaver handoff write` on stdin, which keeps it in `handoff/<session>.md` (600), refuses one that would not fit a whole `Read`, 350 lines or 32,000 bytes, and prints the line that opens the next session with it: `claude "Read <path> whole, then continue from its next step"` in a terminal, or that same line in a new VS Code conversation. `ccsaver handoff` names the latest one. Handoffs are never deleted for you; the `rm -rf` of [Uninstall](../README.md#uninstall) takes them too.

The default limit comes from [175 sessions of one machine](measurements.md#where-the-handoff-limit-comes-from): three of every four working sessions passed 200,000 tokens and made 46 more requests after that, each one carrying the whole history.

## Environment variables

| Variable | Read by | What for |
| --- | --- | --- |
| `CCSAVER_HOME` | everything | relocates the state folder; it must be absolute, because a relative one would follow the working directory and give one machine a different state per folder; the default is `~/.config/ccsaver`, and `XDG_CONFIG_HOME` is not consulted |
| `CLAUDE_PROJECT_DIR` | the hook | the project the session belongs to; the skills get it already expanded by Claude Code, and the command falls back to the working directory |
| `CLAUDE_CODE_EXECPATH` | the fallback, `doctor` | the binary of the running session (undocumented, observed in Claude Code 2.1) |
| `CLAUDE_CODE_SESSION_ID` | the event log | the `session` field of every line |
| `CLAUDE_CODE_CHILD_SESSION` | `doctor` | tells a shell inside a session from one outside (undocumented, observed in 2.1): a `claude` that does not run is a `FAIL` inside and a `warn` outside |
| `CLAUDE_CONFIG_DIR` | the launcher | where Claude Code keeps `plugins/`; the default is `~/.claude` |
| `NO_COLOR`, `TERM` | everything | whether a line is painted: only on a terminal, with `NO_COLOR` unset and `TERM` other than `dumb`, each stream judged on its own, so an error on stderr is painted while stdout goes to a pipe. What is painted is the mark that opens a line, `✓` for a change, `→` for a repeat, `!` for a warning, `✗` for an error, the level label of `doctor`, and the `saved` band; the launcher paints its `key set` lines by the same rule. The colour never carries the meaning: `ok`, `warn` or `FAIL` is always beside the level, `Error:` and `warn:` open their lines painted or not, the sign is always before the band, and a band that crosses zero says so in words |

ccsaver sets `NODE_COMPILE_CACHE` (the `cache/` folder of the state folder) for the hook and the command, and four for the fallback: `MAX_THINKING_TOKENS=0`, `CLAUDE_CODE_EFFORT_LEVEL=low`, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` and `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`.
