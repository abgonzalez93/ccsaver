# Configuration

Everything `/ccsaver:setup` asks for, and the fine print behind it. The [README](../README.md) is the short version.

`/ccsaver:setup` walks a session through all of it and ends with `doctor`. `ccsaver setup` does the same from a shell. These are the subcommands behind them:

```bash
ccsaver worker set https://your-provider.example/v1/chat/completions some-small-model
ccsaver key set                             # see below: never an argument
ccsaver doctor
ccsaver fallback off                        # optional: never spend on the Claude Haiku fallback
ccsaver worker claude ~/.local/bin/claude   # optional: pin the binary the fallback runs
```

## The worker

Any OpenAI-compatible chat completions endpoint works.

- The URL must be `https`, or `http` to `localhost`, `127.0.0.1` or `[::1]`. Any other scheme is refused as you set it, because `fetch` cannot use one: a stored `ftp://localhost/…` would have sent every call to the paid fallback under a message that blamed the host.
- A url that carries a user name or a password (`https://me:token@…`) is refused as you set it. `fetch` rejects one outright, so every call would have fallen through to the paid worker and `doctor` would have reported the host as unreachable.
- A query string is kept, because some endpoints need one, and never printed: `worker set`, `doctor` and a failing probe show the origin and the path only, so a key a provider suggests passing as `?key=…` stays out of the session's context.
- A redirect from the worker counts as a failure, never followed with your file in hand.
- Every request caps the answer at 8,192 tokens with `max_tokens`, so a provider's own default never decides, and an answer cut at either limit says so before it falls back.
- The answer is read whether the endpoint puts it in `choices[0].message.content` as a string or as a list of text parts, which some of them do for a model that reasons first: a shape the reader did not know used to count as no answer and spend the fallback.

Without a worker, or whenever it fails, times out (30 s: the slowest real call measured took 19 s) or cuts its answer short, the call goes to Claude Haiku through your own Claude Code binary: the one the session runs on (`CLAUDE_CODE_EXECPATH`, an undocumented variable observed in Claude Code 2.1), then `claude` on your `PATH`.

`ccsaver worker claude <path>` pins another binary, which wins over both, and `ccsaver worker claude auto` unpins it. Only pin a path that survives updates: the IDE extensions keep their binary in a versioned folder.

Every fall to the paid worker says why on stderr first, a worker that has no key stored included. A key that is there but cannot be read (wrong owner, wrong mode) is named as that, never reported as no key at all. So is a key that carries a character no HTTP header can take — a line break, an accent, a typographic quote that came along with a paste: `fetch` refuses to build that request, so nothing is sent, and reading that refusal as a dead host used to blame your provider while every call went to the paid fallback. `doctor` fails the `key:` line with the same words and never reaches the probe. A fallback that runs out of its 85 s says so instead of printing `spawnSync claude ETIMEDOUT`. When the fallback itself reports an error, the command fails with that error instead of handing it over as an answer.

`worker.json` needs no editing by hand. If it is there but malformed (a stray comma, `"fallback": "false"` in quotes), every call stops with a one-line error and nothing is sent: a typo is never read as "no worker", because that would quietly turn `fallback off` back on. One that is there but cannot be read (wrong owner, wrong mode) stops the call the same way and says so, for the same reason: reading it as no worker would turn `fallback off` back on just as quietly, and `doctor` would report a worker you had configured as one you never had. `worker set` to a different host keeps the stored key and says so: run `ccsaver key set` again unless the key belongs to the new host, or the next call sends it there.

## The key

**The key never travels as an argument.** On a terminal `ccsaver key set` asks for it with the echo off. Everywhere else it reads one line from stdin, so from inside Claude Code you save the key in a file only you touch and let it be read without ever being shown:

```bash
ccsaver key set < ~/my-key.txt && rm ~/my-key.txt
```

`/ccsaver:setup` walks that path and is told not to read the file. Nothing about the key reaches the session: not the command line, not the transcript, not the event log, which records the bare fact of a `key set` and no more.

## The fallback

The fallback spends your Claude usage, so it is as bare as the worker: no built-in tools, no MCP servers, none of your hooks, no thinking, no session title and the lowest effort level (`--tools ""`, `--strict-mcp-config`, `disableAllHooks`, `MAX_THINKING_TOKENS=0`, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`, `CLAUDE_CODE_EFFORT_LEVEL=low`), whatever your Claude Code has configured. A session running at `max` does not drag the fallback up with it.

Every one of them is set both in the child's environment and in `--settings`, because the `env` of a settings file wins over the environment: with `MAX_THINKING_TOKENS=0` in the environment alone and 4,000 in a settings file, a two-character answer took 184 output tokens instead of 5 (one run each).

Left alone, Claude Code titles the session with a second request that carries every file again, and on a subscription login it writes the whole call to a 1-hour cache at twice the input price, which a follow-up never reads because the files and the question travel as one block. The fallback turns the title off and asks for the 5-minute cache (`CLAUDE_CODE_PROMPT_CACHE_TTL=5m`), which took [the measured call](measurements.md#the-haiku-fallback-on-one-8230-token-call) from 0.0257 $ to 0.0128 $.

One user-level `SessionStart` hook measured 1,987 input tokens against 590 for the same one-line prompt (one run each), and its text reached the worker's context next to the instruction. That is why `disableAllHooks` is there.

It is bounded as well:

- 85 s, so that the worker's 30 s and the fallback's fit inside the 120 s Claude Code gives a Bash command.
- 0.50 $ a call (`--max-budget-usd`), which stops the retries Claude Code makes on its own when an answer hits an output limit (4 turns measured against a 200-token limit).
- 400,000 characters of files per call: Haiku's context window is 200,000 tokens and the chars/4 estimate has measured about half of a real count, so a bigger call fails with a one-line error before anything is spent. The external worker has no such cap; its limit is your provider's.

`ccsaver fallback off` turns it off once a worker is set: a call the worker cannot answer then fails with a one-line error and Claude reads by ranges instead, and a call that names a file outside the plugged root sends nothing anywhere. `ccsaver fallback on` brings it back. Both refuse until there is a worker, because the switch lives in `worker.json` and without one the fallback is the only worker there is: a confirmation for a setting that was never stored would be a lie. So does `ccsaver worker claude`, for the same reason, and all three name `ccsaver worker set <url> <model>` in the refusal. Typed with the value already in force, each of them says so, `the fallback is already on`, `the fallback binary is already pinned: <path>`, and writes nothing: on is the default, so a fresh `worker.json` answers `fallback on` that way and stays as it was. Every confirmation carries what the switch means, `a call the worker cannot take goes to paid Claude Haiku` or `fails instead`, so the word `on` never stands alone.

Claude Code's documentation says `--bare` will become the default for `-p`, and bare mode does not use a subscription login: on a future version the fallback may need an `ANTHROPIC_API_KEY`.

## doctor

`doctor` stops at a `node` older than 24.2, and then checks, in order:

- The permissions of the state folder and of every file it keeps there: the key, `plugged` and `worker.json`, all 600, plus `prices.json` at 600 and your own `adapters/` at 700 once either one exists — a folder made by hand is world-readable, and the adapters in it carry your house style.
- Whether the [event log](events.md) is on and how many bytes this month's file holds, a file it cannot read being a `FAIL` of its own rather than the end of the report, and while it is on, how many of the month's whole-file reads the hook denied and the median length of the ones it did (`denied:`), and how many of the month's delegations went to paid Claude Haiku, what they cost and why (`spent:`).
- The worker, with a probe shaped like a real call: same temperature, same `max_tokens`, a system message, so a provider that would refuse the real thing fails here. 200 = the key works, 401/403 = rejected, and a timeout is told from a host that cannot be reached. A `worker.json` it cannot trust fails the line.
- The fallback binary, with `--version`, unless the fallback is off.
- Every plugged project, with its adapter and limits. For each one it feeds the hook a throwaway file one line over the limit, and the `gate:` line fails unless that read is denied.
- The shape of every plugged project, measured again on each run. A `warn shape:` line appears only when the project has outgrown its limit; see [Limits](#limits).

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

Every field is optional. `format` runs from the project root with the written file appended, and a path that climbs out of that root (`../tools/fmt.sh`) is not run at all — the line says so and the file is left unformatted, because the one command ccsaver runs without asking should not be reachable from outside the project you plugged in; for at most 60 s and never past what is left of the 115 s the command gives itself inside the 120 s of a Bash call, so a slow worker leaves the formatter less and it always keeps at least 1 s; a failing formatter is reported, not fatal; `after` lines are printed as `next:` commands for the model to run, with `{target}` replaced by the absolute path, shell-quoted when it needs it, so do not add quotes of your own; `maxLines` and `maxTokens` move the hook's thresholds, which [Limits](#limits) covers. [`adapters/strict-ts.json`](../adapters/strict-ts.json) is a working example, and what its `rules` are worth carries [its own note](measurements.md#the-rules-of-an-adapter): they reach the worker and change what it writes, 3 runs of 4 against 0 of 4, while the import they were once credited with came out right with them and without them.

## Limits

Two numbers decide what the hook denies: `maxLines`, and `maxTokens`, which counts bytes/4. A whole-file `Read` past either one is denied, and a file past the byte limit is never opened to count its lines. The defaults are 350 lines and 8,000 tokens, which is this repository's own house style rather than a measured optimum.

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

Both limits are measured because both deny, and a file can need both raised: a 1,058-line test file of 41 KB is over the line limit *and* over the token limit, so moving one alone leaves it denied by the other.

The proposal never falls below the defaults, because a repository of ten short files would otherwise argue for a limit far worse than 350. Under twenty countable files it refuses to judge at all: one file in twenty is not a number.

The measurement is taken at `plug` and at every `doctor`, and nowhere else: the hook never walks the project, because it answers every `Read` inside 24 ms. So a repository that grows past its limits says nothing until someone runs `doctor` again, which is worth doing when the project has changed shape rather than on a schedule. Nothing is stored between runs, so the answer is always that day's.

`doctor` measures again on every run and adds one `warn shape:` line per project that has outgrown its limits, which is the moment the hook starts denying files the model should read whole. It is never a `FAIL`: nothing is broken, the limits are simply no longer the right ones. Growth the other way needs no warning, because a limit nothing reaches is merely inert.

To move them, put them in an adapter. `plug` and `doctor` end their line with the command that does it:

```bash
ccsaver adapter vellum maxLines=400 maxTokens=8000
```

It writes `~/.config/ccsaver/adapters/<name>.json` at 600, in a folder it puts back to 700 on every write because a hand that made it first leaves it readable by everyone, creating the file or merging into what is already there, so an adapter that carries `rules` and `format` keeps them; a pair the adapter already holds, `adapter <name> already holds maxLines=400, nothing changed`, leaves the file untouched. It takes `maxLines` and `maxTokens` only, both positive integers up to a million — far past the 2,850 lines the widest corpus measured asked for, and low enough that a typed extra zero cannot make `doctor` write a gigabyte of throwaway file to check the gate, or the hook read one into memory — and a pair it cannot take is named back to you rather than answered with the usage; every other field is edited by hand. An adapter that is there but malformed, or that cannot be read, stops the command instead of being written over, the same way `worker.json` does: the file that carries your `rules` and your `format` is never replaced by one that carries a limit and nothing else. A project with no adapter gets a second command beside the first, `ccsaver plug <root> <name>`, because an adapter nothing points at changes nothing; the name is made from the folder, lowercased with everything an adapter name cannot hold turned into `-`, so `~/code/My_App` proposes `my-app`.

On a terminal you do not have to copy it: `doctor` offers to run it, one `warn` at a time. It reads your whole answer before judging it, so a long one is never cut at its first word and never spills into the next question.

While the [event log](events.md) is on, `doctor` also prints a `denied:` line: how many of this month's whole-file reads the hook actually denied, and the median length of the ones it did. That is the measured answer beside the predicted one, and the two disagree in a useful way — a project can hold long files the model never reads.

## saved

`ccsaver saved` adds up [the event log](events.md) and says what the month cost against what it would have cost without the plugin. `/ccsaver:saved` runs it from a session and reads the answer back with every caveat the foot of the report carries, which is the part a summary drops first. It is the long form of doctor's one-line `spent:`, and it reads the log only: it never calls a worker and never writes anything but the price you set.

```
ccsaver saved            # the month in course
ccsaver saved 2026-08    # that month
ccsaver saved all        # every month the log still holds, one line in memory at a time
```

It needs prices, in dollars per million input tokens, because ccsaver cannot see what your session pays. **A price belongs to a model, not to the month**, because the model changes and the rates are far apart:

```bash
ccsaver price claude-opus-5 5.00      # what your session model charges
ccsaver price claude-fable-5-1 10.00  # and any other you work on
ccsaver price worker 0.10             # the cheap worker, or 0 when its tier is free
ccsaver price                         # what is set, one to a line
```

The hook records which model was running for every read it sees ([the event log](events.md)), so the report prices each model's reads at that model's own rate and never spreads one number over a month that changed model. A model that turns up in the log with no price of its own is **named, with the command that gives it one, and its tokens are left out of the sum** — a rate borrowed from another model would be a number without a source. Reads the hook could not name a model for are counted apart in the same way. When that leaves no denied read with a price at all, the report draws no bars and says there is no `without` side to draw: an empty column set against a full one reads as a loss, and a missing rate is not a loss.

They live in `~/.config/ccsaver/prices.json` (600), apart from `worker.json` so that the file holding the `fallback` switch gains no surface. A model price must be above zero, and the worker's may be `0`, which is the free tier of a provider said out loud: the report then writes *the worker is free* instead of asking for a number that does not exist. Wherever the worker is named — the list, the line that confirms a price, the foot of the report — the model from `worker.json` rides in brackets beside it, so `worker` on its own never stands in for an endpoint you pointed somewhere else months ago. No price is shipped: one would go stale, and a number without a source is what this project refuses to print. With no model priced the report counts tokens and stops there. A `prices.json` that is there but malformed or unreadable stops the command, the same way `worker.json` does, and so does a month's log file that is there but cannot be read: a report that counted it as an empty month would be the one lie this command cannot afford. A `prices.json` carrying the single `main` price of 0.13 and earlier is refused rather than read as the rate for every model.

Adding a month up never holds it in memory: the reader hands the tally [one row at a time](measurements.md#adding-up-a-month-of-the-log), so `all` over a year costs what the longest month costs to read, not what the year weighs.

**The numbers are a band, never a point.** A real `Read` measured [1.9–2.8× the bytes/4 estimate](measurements.md#the-hooks-token-estimate-vs-a-real-read), so both columns carry that multiplier. It is the same unknown on both sides, so the two arms pair low with low: the dollars swing by half, and the percentage barely moves. Read the percentage.

```
ccsaver saved · 2026-09

  denied     181 whole-file reads, 1.83 M tokens by bytes/4
  instead    63 ranged reads while plugged, 0.08 M tokens
  delegated  112 calls · 98 external (1.13 M tokens) · 14 paid Haiku ($0.2019)

  without    $10.45 - $15.40    ██████████████████████
  with       $0.76 - $0.97      █·····················
  saved      $9.69 - $14.43     93 % - 94 %

  at $5/M for claude-opus-5 and $0.1/M for the worker (gemini-flash-lite-latest)
```

`instead` is the line that keeps the rest honest: a denial is not a saving, because the model then reads the file by ranges and pays for those. It counts every ranged read in a plugged project, not only the ones a denial caused, which errs towards charging ccsaver for reads it never provoked rather than the other way round. Each one is weighed by the share of the file its `offset` and `limit` cover, so a hundred lines of a thousand count as a tenth of the file. A ranged read of a file past the byte limit is the exception: the hook never counts the lines of such a file ([the event log](events.md) holds `null` there), so the log cannot say what share a range covered, and the report counts the read in the `instead` line but leaves its tokens out of the sum rather than charging the whole file to a hundred lines. The foot says how many there were. A month where the delegations cost more than the reads they replaced prints a negative saving, in red, with no percentage beside it; a month whose band crosses zero — a loss at the low end of the 1.9–2.8× multiplier and a saving at the high end — says that in words and is painted no colour at all, because neither one would be true.

Five things it cannot see, and says so at the foot when they bite: the gate watches the `Read` tool only, so a `Grep` or a `cat` that replaced a denied read is in neither column; an endpoint that returns no `usage` block is counted at chars/4, and the report says how many calls that was; a month whose denied reads have nothing recorded against them is named as the most flattering reading there is; a ranged read of a file past the byte limit has no line count to weigh it by, so its tokens are left out of `instead`; and neither column holds the tokens the session itself read because of ccsaver — [~94 per denial message](measurements.md#what-ccsaver-adds-to-the-sessions-own-context) plus every worker answer it read back — which the foot counts and leaves out of the sum, because the log never says which model was running when an answer came home. All five lean the same way, towards flattering ccsaver, which is why they are printed rather than folded in. There is no floor on the sample: the bars are drawn from the first denied read onwards, and the three counts printed over them are what they rest on — a band from two denials is as wide on the page as a band from two hundred, and reading it as two is yours to do. A month with no denied read and no ranged read has nothing to set side by side, and says that where the bars would go.

## Environment variables

| Variable | Read by | What for |
| --- | --- | --- |
| `CCSAVER_HOME` | everything | relocates the state folder; it must be an absolute path, because a relative one would follow the working directory and give the same machine a different state per folder; the default is `~/.config/ccsaver`, and `XDG_CONFIG_HOME` is not consulted |
| `CLAUDE_PROJECT_DIR` | the hook | the project the session belongs to; the skills get it already expanded by Claude Code, and the command falls back to the working directory |
| `CLAUDE_CODE_EXECPATH` | the fallback, `doctor` | the binary of the running session (undocumented, observed in Claude Code 2.1) |
| `CLAUDE_CODE_SESSION_ID` | the event log | the `session` field of every line |
| `CLAUDE_CODE_CHILD_SESSION` | `doctor` | tells a shell inside a session from one outside (undocumented, observed in 2.1): a `claude` that does not run is a `FAIL` inside and a `warn` outside |
| `NO_COLOR`, `TERM` | everything | whether a line is painted: only on a terminal, with `NO_COLOR` unset and `TERM` other than `dumb`, and each stream judged on its own, so an error on stderr is painted while stdout goes to a pipe. What is painted is the mark that opens a line, `✓` for a change, `→` for a repeat, `!` for a warning, `✗` for an error, the level label of `doctor`, and the `saved` band; the launcher paints its `key set` lines by the same rule. The colour never carries the meaning on its own: the word `ok`, `warn` or `FAIL` is always beside the level, `Error:` and `warn:` open their lines whether painted or not, the sign is always in front of the band, and a band that crosses zero says so in words. Off a terminal there is no mark either, so a parser reads plain words |

ccsaver sets `NODE_COMPILE_CACHE` (the `cache/` folder of the state folder) for the hook and the command, and four for the fallback: `MAX_THINKING_TOKENS=0`, `CLAUDE_CODE_EFFORT_LEVEL=low`, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` and `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`.
