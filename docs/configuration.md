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

- The URL must be `https`, or point at `localhost`, `127.0.0.1` or `[::1]`.
- A url that carries a user name or a password (`https://me:token@…`) is refused as you set it. `fetch` rejects one outright, so every call would have fallen through to the paid worker and `doctor` would have reported the host as unreachable.
- A query string is kept, because some endpoints need one, and never printed: `worker set`, `doctor` and a failing probe show the origin and the path only, so a key a provider suggests passing as `?key=…` stays out of the session's context.
- A redirect from the worker counts as a failure, never followed with your file in hand.
- Every request caps the answer at 8,192 tokens with `max_tokens`, so a provider's own default never decides, and an answer cut at either limit says so before it falls back.
- The answer is read whether the endpoint puts it in `choices[0].message.content` as a string or as a list of text parts, which some of them do for a model that reasons first: a shape the reader did not know used to count as no answer and spend the fallback.

Without a worker, or whenever it fails, times out (30 s: the slowest real call measured took 19 s) or cuts its answer short, the call goes to Claude Haiku through your own Claude Code binary: the one the session runs on (`CLAUDE_CODE_EXECPATH`, an undocumented variable observed in Claude Code 2.1), then `claude` on your `PATH`.

`ccsaver worker claude <path>` pins another binary, which wins over both, and `ccsaver worker claude auto` unpins it. Only pin a path that survives updates: the IDE extensions keep their binary in a versioned folder.

Every fall to the paid worker says why on stderr first, a worker that has no key stored included. A key that is there but cannot be read (wrong owner, wrong mode) is named as that, never reported as no key at all. A fallback that runs out of its 85 s says so instead of printing `spawnSync claude ETIMEDOUT`. When the fallback itself reports an error, the command fails with that error instead of handing it over as an answer.

`worker.json` needs no editing by hand. If it is there but malformed (a stray comma, `"fallback": "false"` in quotes), every call stops with a one-line error and nothing is sent: a typo is never read as "no worker", because that would quietly turn `fallback off` back on. `worker set` to a different host keeps the stored key and says so: run `ccsaver key set` again unless the key belongs to the new host, or the next call sends it there.

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

`ccsaver fallback off` turns it off once a worker is set: a call the worker cannot answer then fails with a one-line error and Claude reads by ranges instead, and a call that names a file outside the plugged root sends nothing anywhere. `ccsaver fallback on` brings it back. Both refuse until there is a worker, because the switch lives in `worker.json` and without one the fallback is the only worker there is: a confirmation for a setting that was never stored would be a lie.

Claude Code's documentation says `--bare` will become the default for `-p`, and bare mode does not use a subscription login: on a future version the fallback may need an `ANTHROPIC_API_KEY`.

## doctor

`doctor` stops at a `node` older than 24.2, and then checks, in order:

- The permissions of the state folder and of every file it keeps there: the key, `plugged` and `worker.json`, all 600.
- Whether the [event log](events.md) is on and how many bytes this month's file holds, and while it is on, how many of the month's whole-file reads the hook denied and the median length of the ones it did (`denied:`), and how many of the month's delegations went to paid Claude Haiku, what they cost and why (`spent:`).
- The worker, with a probe shaped like a real call: same temperature, same `max_tokens`, a system message, so a provider that would refuse the real thing fails here. 200 = the key works, 401/403 = rejected, and a timeout is told from a host that cannot be reached. A `worker.json` it cannot trust fails the line.
- The fallback binary, with `--version`, unless the fallback is off.
- Every plugged project, with its adapter and limits. For each one it feeds the hook a throwaway file one line over the limit, and the `gate:` line fails unless that read is denied.
- The shape of every plugged project, measured again on each run. A `warn shape:` line appears only when the project has outgrown its limit; see [Limits](#limits).

It never prints the key, its length or the query of the worker url. From a terminal outside Claude Code with no `claude` on the `PATH`, the fallback line is a `warn`, not a failure: that shell cannot see the binary a session brings, so run `doctor` from inside one.

Whether the plugin itself is enabled is Claude Code's to say: `claude plugin list`. `ccsaver version` prints the version you are running.

## Adapters

An adapter is a small JSON file with what is specific to one project. ccsaver looks for `<name>.json` in `~/.config/ccsaver/adapters/` first and in this repository's `adapters/` second, so your project's adapter can stay private.

```json
{
  "rules": "house style the writer must follow, appended to its instruction",
  "format": ["node_modules/.bin/biome", "check", "--write"],
  "after": ["node_modules/.bin/biome check {target}"],
  "maxLines": 350,
  "maxTokens": 8000
}
```

Every field is optional. `format` runs from the project root with the written file appended, for at most 60 s and never past what is left of the 115 s the command gives itself inside the 120 s of a Bash call, so a slow worker leaves the formatter less and it always keeps at least 1 s; a failing formatter is reported, not fatal; `after` lines are printed as `next:` commands for the model to run, with `{target}` replaced by the absolute path, shell-quoted when it needs it, so do not add quotes of your own; `maxLines` and `maxTokens` move the hook's thresholds, which [Limits](#limits) covers. [`adapters/strict-ts.json`](../adapters/strict-ts.json) is a working example: with those rules the worker imported from the right module in 4 of 4 runs, against 0 of 4 without them.

## Limits

Two numbers decide what the hook denies: `maxLines`, and `maxTokens`, which counts bytes/4. A whole-file `Read` past either one is denied, and a file past the byte limit is never opened to count its lines. The defaults are 350 lines and 8,000 tokens, which is this repository's own house style rather than a measured optimum.

The two ways of being wrong do not cost the same. **Too high is inert**: the hook stops firing and you have what you had without the plugin. **Too low degrades the session**: the model pays for the denial, then pages through ranges it picked from Grep, and ends up reasoning over fragments. That is the [3.6× row](../README.md#honest-limits). Err high.

The right numbers belong to the repository, so `ccsaver plug` measures them. It walks the project, skipping `node_modules`, `.git`, `dist`, `build`, `target`, `vendor`, `.venv`, `venv`, `__pycache__`, `coverage`, `.next`, `.turbo`, `out`, `.cache`, `.gradle` and `Pods`, never following a symlinked directory, reads the first 8 KB of each file to leave the binary ones out and counts a file that ends inside those 8 KB from them rather than reading it twice, skips anything past 1 MB, and reports the length and weight 19 files in 20 stay under:

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

It writes `~/.config/ccsaver/adapters/<name>.json` at 600, in a folder it puts back to 700 on every write because a hand that made it first leaves it readable by everyone, creating the file or merging into what is already there, so an adapter that carries `rules` and `format` keeps them. It takes `maxLines` and `maxTokens` only, both positive integers; every other field is edited by hand. An adapter that is there but malformed stops the command instead of being written over, the same way `worker.json` does: the file that carries your `rules` and your `format` is never replaced by one that carries a limit and nothing else. A project with no adapter gets a second command beside the first, `ccsaver plug <root> <name>`, because an adapter nothing points at changes nothing; the name is made from the folder, lowercased with everything an adapter name cannot hold turned into `-`, so `~/code/My_App` proposes `my-app`.

On a terminal you do not have to copy it: `doctor` offers to run it, one `warn` at a time. It reads your whole answer before judging it, so a long one is never cut at its first word and never spills into the next question.

While the [event log](events.md) is on, `doctor` also prints a `denied:` line: how many of this month's whole-file reads the hook actually denied, and the median length of the ones it did. That is the measured answer beside the predicted one, and the two disagree in a useful way — a project can hold long files the model never reads.

## Environment variables

| Variable | Read by | What for |
| --- | --- | --- |
| `CCSAVER_HOME` | everything | relocates the state folder; it must be an absolute path, because a relative one would follow the working directory and give the same machine a different state per folder; the default is `~/.config/ccsaver`, and `XDG_CONFIG_HOME` is not consulted |
| `CLAUDE_PROJECT_DIR` | the hook | the project the session belongs to; the skills get it already expanded by Claude Code, and the command falls back to the working directory |
| `CLAUDE_CODE_EXECPATH` | the fallback, `doctor` | the binary of the running session (undocumented, observed in Claude Code 2.1) |
| `CLAUDE_CODE_SESSION_ID` | the event log | the `session` field of every line |
| `CLAUDE_CODE_CHILD_SESSION` | `doctor` | tells a shell inside a session from one outside (undocumented, observed in 2.1): a `claude` that does not run is a `FAIL` inside and a `warn` outside |

ccsaver sets `NODE_COMPILE_CACHE` (the `cache/` folder of the state folder) for the hook and the command, and four for the fallback: `MAX_THINKING_TOKENS=0`, `CLAUDE_CODE_EFFORT_LEVEL=low`, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` and `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`.
