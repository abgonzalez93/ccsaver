<img src="assets/icon.svg" width="96" alt="ccsaver logo">

# ccsaver

A Claude Code plugin that keeps two expensive habits out of the main model's context, only in the projects you plug in:

- **Whole-file reads of big files.** A `PreToolUse` hook denies a `Read` of a whole file over 350 lines or 32 KB (8,000 tokens by the bytes/4 rule; a real `Read` [measures about twice that](#honest-limits-with-numbers)) and points the model at Grep, at a ranged read, or at the `bulk-reader` skill.
- **Boilerplate writing.** The `code-writer` skill hands tests, fixtures and stubs to a cheap worker and lets your project's own checks review the result.

Both skills call one command, `ccsaver`, which makes **one tool-less, one-shot call** to a cheap model: an OpenAI-compatible endpoint of your choice, with Claude Haiku (through your own Claude Code) as the fallback. The expensive model sees the short answer, never the file.

A project that is not plugged in gets nothing: the hook exits before starting Node, the command refuses to run, and no byte leaves your machine.

> **Plugging a project in sends whole files from it to a third party.** The worker you configure receives them, and free API tiers may train on what you send. Read your provider's terms before you plug in private code. [What leaves your machine](#what-leaves-your-machine) has the exact boundary.

ccsaver is an independent project. It is not affiliated with or endorsed by Anthropic.

## Honest limits, with numbers

Measured on one TypeScript monorepo with Claude Code 2.1, small samples (1–4 sessions per cell). Treat them as a starting point and [measure your own](#measure-it-yourself).

| What | Result |
| --- | --- |
| Hook, task = locate or describe something in a big file | **−16 %** session cost (0.58 $ vs 0.69 $; replicated 0.60 / 0.56 $ vs 0.72 / 0.66 $) |
| Hook, task = a judgement question about the file | no saving, **3.6× slower** (230 s vs 64 s): the model pages through ranges and delegates on top |
| Delegated writing of a ~110-line test file | **break-even**: 0.80–1.02 $ vs 0.85 $ written directly; the cost is the review, not the writing |
| Files where delegation starts to pay | roughly **2,000–3,000 lines** and up |
| Fixed cost of the two skill descriptions | **~188 tokens per session, in every project** (≈ 0.006 $ on a frontier model) |
| Hook overhead per `Read` (mean of 30, process spawn included) | **1–3 ms** in an unplugged project (the `sh` gate exits before starting Node), **≈ 22 ms** in a plugged one (Node start-up with its compile cache; 49 ms without it) |
| One-shot worker vs a subagent for the same read | 4–8 s and 0.03–0.07 $ vs 26–169 s and up to 0.14 $ |
| The Haiku fallback on one 8,230-token call (this README with line numbers, Claude Code 2.1.274, subscription login, one run per arm) | **0.0257 $ → 0.0128 $** once it stopped asking for a session title, a second hidden request that carried the whole file again, and wrote a 5-minute cache instead of a 1-hour one. A follow-up question on the same file read 0 tokens from that cache either way |
| Citation check in `bulk-read` (one free model, files up to 493 lines, 183 citations in 18 answers) | 142 matched their line and 41 were tagged, all in 7 of the answers: 2 mis-copied words, and **39 false alarms** where the line was right and its shape was not (an invented column, `path:69:1:text`, 25 times; the line number twice; a dangling ` @ `; the citation written twice). The 4 answers that locate matched 97 of 97. A false alarm costs a ranged `Read`, never a wrong line. The earlier wording, `grep -n`, was tagged as often on the same questions in the same hour (38 of 278, in 6 of 18 answers); its first sample, on other files, had matched 268 of 269. In that first sample, asking for the evidence changed what the worker wrote: over 7 questions Claude received 0.7–2.5× the unchecked answer (3 shrank, 4 grew), and the worker itself wrote up to 3.2× more, which took the slowest call from 12 s to 19 s |
| The same check with the Haiku fallback as the reader (Claude Code 2.1.274; this README, `src/hook.ts` and `src/state.ts`, one file and one question per call, 5 calls per file per wording) | The instruction used to say "the way `grep -n` prints it", and for one file that is `line:text`: **10 of 15** answers carried no citation the check could read, and 58 cited lines reached Claude whole and unchecked. With `grep -Hn` and "the path first even when there is one file", **1 of 15** (it cited `path:line` and no text), **0** citations without their path, 147 matched, 1 renumbered, 6 tagged, and Claude received 8,949 bytes where it had received 13,551 |
| The hook's token estimate (bytes/4) vs the real cost of a whole-file `Read` | the real cost measured **1.9–2.2×** the estimate on batches of 16–27 KB and 2.1–2.8× on batches of small files (Fable 5.1, 9 batches in 2 sessions, line numbers included): the 8,000-token limit lets through reads of about 16,000 real tokens. A denied `Read` costs 136–251 tokens |

Other limits:

- **Linux and macOS only.** The gate is a POSIX `sh` script.
- The cheap worker ignores style rules now and then. That is why `code-writer` treats your project's checks as the reviewer and why adapters can list follow-up commands.
- **Line citations are checked, claims are not.** `bulk-read` asks the worker to end each bullet with the line that proves it, the way `grep -Hn` prints it, the path first even when there is one file, and compares that text with the file: a match is cut down to `path:line`, a quote found on one other line is renumbered, and anything else is tagged `[unverified]`. The note on stderr adds up the three, and says how many answer lines carry no citation at all. What the worker *says* about the code is still the word of a cheap model.
- If most of your files are under 300 lines, the hook will rarely fire and the honest expectation is a small saving.
- **The gate is a nudge, not a wall.** It watches the `Read` tool only, and only whole-file reads: a ranged `Read` that happens to cover the whole file (`limit: 2000` on a 400-line file) passes, and so does `cat` through Bash. The [event log](#the-event-log) records every ranged read with its `offset`, its `limit` and the lines of the file, so you can count how often that happens before deciding it matters.
- **Permission prompts.** Each skill pre-approves its own subcommand and nothing else. Claude Code 2.1.274 applies that grant when you type `/ccsaver:bulk-reader` yourself; when Claude invokes the skill on its own, which is what the hook's message asks for, it registers the grant but does not apply it, so your usual permission flow decides. Answer "don't ask again" once, or add `Bash(ccsaver bulk-read *)` and `Bash(ccsaver code-write *)` to `permissions.allow` in `~/.claude/settings.json`. The rules name the bare command because Claude Code puts the plugin's `bin/` folder on the Bash tool's `PATH`, where it measured as the last entry: they pre-approve whichever `ccsaver` that `PATH` finds first.

## Requirements

Claude Code, Node.js 24 or newer (the active LTS line; the sources are TypeScript run directly by Node), and a POSIX `sh`.

## Install

Clone the repository, add the clone as the marketplace, and link the launcher into a folder on your `PATH`:

```bash
git clone https://github.com/abgonzalez93/ccsaver ~/src/ccsaver
claude plugin marketplace add ~/src/ccsaver
claude plugin install ccsaver@abgonzalez93
mkdir -p ~/bin && ln -s ~/src/ccsaver/bin/ccsaver ~/bin/ccsaver
```

A plugin installed from a local folder loads in place, so the path stays stable across updates.

Installing straight from GitHub (`claude plugin marketplace add abgonzalez93/ccsaver`) gives you the hook and both skills, which call the bare `ccsaver` that Claude Code puts on the Bash tool's `PATH`. It gives you no `ccsaver` in your terminal, which is how you plug projects in and type the key: the launcher then lives in Claude Code's plugin cache, in a folder that changes with every update.

## Update

From a clone, pull it:

```bash
git -C ~/src/ccsaver pull --ff-only
```

The next Claude Code session, or `/reload-plugins`, runs the new code: a plugin installed from a local folder loads its current files at every session start.

`ccsaver version` follows the pull at once: one new commit took it from 0.2.0 to 0.2.1. `claude plugin list` keeps the number it recorded at install time until `claude plugin update ccsaver@abgonzalez93`, which changes nothing that runs: the 344 KB copy it leaves in Claude Code's plugin cache is never loaded.

Installed straight from GitHub, Claude Code runs a copy and refreshes it only when asked, because a third-party marketplace has auto-update off until you turn it on under `/plugin` → Marketplaces:

```bash
claude plugin marketplace update abgonzalez93
claude plugin update ccsaver@abgonzalez93
```

Then open a new session or run `/reload-plugins`. Every commit on `main` carries [its own version](#versions), and that number is what `plugin update` compares: it answered "updated from 0.1.0 to 0.1.1" to one new commit, and "already at the latest version" while the number stood still. `ccsaver version` prints the one you are running, and [CHANGELOG.md](CHANGELOG.md) says what each one changed.

## Plug a project in

```bash
ccsaver plug ~/code/my-project            # hook + skills on, default limits
ccsaver plug ~/code/my-project strict-ts  # same, with an adapter
ccsaver list
ccsaver unplug ~/code/my-project
```

Nothing is written inside the project. The state lives in `~/.config/ccsaver/`:

```
api-key       600, the key of the external worker
worker.json   { "url", "model", "claude"?, "fallback"? }
plugged       one line per project: <real path><TAB><adapter>
adapters/     your own adapters (optional)
cache/        Node's compile cache for the hook and the CLI
log/          the event log, only after `ccsaver log on` (700, one 600 file per month)
```

`plug` stores the real path and refuses `/`, your home folder and any folder that contains the state folder.

## Point it at a cheap worker

```bash
ccsaver worker set https://your-provider.example/v1/chat/completions some-small-model
ccsaver key set     # typed on the terminal with echo off; never an argument
ccsaver doctor
ccsaver fallback off   # optional: never spend on the Claude Haiku fallback
ccsaver worker claude ~/.local/bin/claude   # optional: pin the binary the fallback runs
```

Any OpenAI-compatible chat completions endpoint works; the URL must be `https` (localhost excepted). Without a worker, or whenever it fails, times out (30 s: the slowest real call measured took 19 s) or cuts its answer short, the call goes to Claude Haiku through your own Claude Code binary (every request caps the answer at 8,192 tokens with `max_tokens`, so a provider's own default never decides, and an answer cut at either limit says so before it falls back): the one the session runs on (`CLAUDE_CODE_EXECPATH`, an undocumented variable observed in Claude Code 2.1), then `claude` on your `PATH`. `ccsaver worker claude <path>` pins another binary, which wins over both, and `ccsaver worker claude auto` unpins it; only pin a path that survives updates: the IDE extensions keep their binary in a versioned folder. A redirect from the worker counts as a failure, never followed with your file in hand. When the fallback itself reports an error, the command fails with that error instead of handing it over as an answer. Every fall to the paid worker says why on stderr first, a worker that has no key stored included.

`worker.json` needs no editing by hand. If it is there but malformed (a stray comma, `"fallback": "false"` in quotes), every call stops with a one-line error and nothing is sent: a typo is never read as "no worker", because that would quietly turn `fallback off` back on. `worker set` to a different host keeps the stored key and says so: run `ccsaver key set` again unless the key belongs to the new host, or the next call sends it there.

The fallback spends your Claude usage, so it is as bare as the worker: no built-in tools, no MCP servers, none of your hooks, no thinking, no session title and the lowest effort level (`--tools ""`, `--strict-mcp-config`, `disableAllHooks`, `MAX_THINKING_TOKENS=0`, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`, `CLAUDE_CODE_EFFORT_LEVEL=low`), whatever your Claude Code has configured: a session running at `max` does not drag the fallback up with it. Every one of them is set both in the child's environment and in `--settings`, because the `env` of a settings file wins over the environment: with `MAX_THINKING_TOKENS=0` in the environment alone and 4,000 in a settings file, a two-character answer took 184 output tokens instead of 5 (one run each). Left alone, Claude Code titles the session with a second request that carries every file again, and on a subscription login it writes the whole call to a 1-hour cache at twice the input price, which a follow-up never reads because the files and the question travel as one block; the fallback turns the title off and asks for the 5-minute cache (`CLAUDE_CODE_PROMPT_CACHE_TTL=5m`), which took [the measured call](#honest-limits-with-numbers) from 0.0257 $ to 0.0128 $. It is bounded as well: 85 s, so that the worker's 30 s and the fallback's fit inside the 120 s Claude Code gives a Bash command, and 0.50 $ a call (`--max-budget-usd`), which stops the retries Claude Code makes on its own when an answer hits an output limit (4 turns measured against a 200-token limit). One user-level `SessionStart` hook measured 1,987 input tokens against 590 for the same one-line prompt (one run each), and its text reached the worker's context next to the instruction. `ccsaver fallback off` turns it off once a worker is set: a call the worker cannot answer then fails with a one-line error and Claude reads by ranges instead, and a call that names a file outside the plugged root sends nothing anywhere. `ccsaver fallback on` brings it back. The fallback takes at most 400,000 characters of files per call: Haiku's context window is 200,000 tokens and the chars/4 estimate has measured about half of a real count, so a bigger call fails with a one-line error before anything is spent. The external worker has no such cap; its limit is your provider's. Claude Code's documentation says `--bare` will become the default for `-p`, and bare mode does not use a subscription login: on a future version the fallback may need an `ANTHROPIC_API_KEY`.

`doctor` stops at a `node` older than 24, checks the permissions of the state folder and the key, says whether the [event log](#the-event-log) is on and how many bytes this month's file holds and, while it is on, how many of the month's delegations went to paid Claude Haiku, what they cost and why (`spent:`), sends a probe shaped like a real call, with the same temperature, the same `max_tokens` and a system message, so a provider that would refuse the real thing fails here (200 = the key works, 401/403 = rejected, and a timeout is told from a host that cannot be reached), fails on a `worker.json` it cannot trust, runs the fallback binary with `--version` (unless the fallback is off), and lists each plugged project with its adapter and limits. For each of them it then feeds the hook a throwaway file one line over the limit, and the `gate:` line fails unless that read is denied. Whether the plugin itself is enabled is Claude Code's to say: `claude plugin list`. It never prints the key or its length. From a terminal outside Claude Code with no `claude` on the `PATH`, the fallback line is a `warn`, not a failure: that shell cannot see the binary a session brings, so run `doctor` from inside one. `ccsaver version` prints the version you are running.

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

Every field is optional. `format` runs from the project root with the written file appended, for at most 60 s, and a failing formatter is reported, not fatal; `after` lines are printed as `next:` commands for the model to run, with `{target}` replaced by the absolute path, shell-quoted when it needs it, so do not add quotes of your own; `maxLines` and `maxTokens` move the hook's thresholds (`maxTokens` counts bytes/4). [`adapters/strict-ts.json`](adapters/strict-ts.json) is a working example: with those rules the worker imported from the right module in 4 of 4 runs, against 0 of 4 without them.

## What leaves your machine

- Unplugged project: nothing, ever.
- Files inside the plugged root travel labelled with their path relative to that root, so your user name and folder layout stay home.
- Plugged project: a file goes to the external worker only when the real path of **every** file in the call is inside the plugged root. Each path is resolved once, so the file that is judged is the file that is read, and a file named twice, by its path and through a symlink, is judged under both names and sent once. One file outside (a note in your home, a symlink pointing out) sends the whole call to the Haiku fallback instead, or makes it fail when the fallback is off.
- Files that look like secrets (`.env*`, `*.pem`, `*.key`, `id_rsa`, `.npmrc`, `credentials*`, `settings.local.json`, `*.tfstate`, `*.tfvars.json`…) are refused outright, by given name and by real name, in any letter case; `.env.example`, `.env.sample` and `.env.template` go through, because they are the documentation of a project's variables. So is anything under a folder named `secrets`, `.secrets`, `.ssh`, `.aws`, `.gnupg` or `.kube`, and `.docker/config.json`; the path is judged from the plugged root down, so a project that lives under `~/secrets/` still works. So is any file that holds a private-key header or a token with a well-known shape (AWS `AKIA…`, GitHub `ghp_…`, Slack `xoxb-…`, `sk-…`, Google `AIza…`), whatever its name, and any binary file. The list is a net, not a guarantee: a password pasted into `config.ts` goes out with it.
- The state folder stays home: a call that names a file under `~/.config/ccsaver/` is refused before anything is sent, and the [event log](#the-event-log) in it is a local file that no code in ccsaver sends anywhere.
- `code-write --target` never overwrites an existing file, only writes inside the plugged root (symlinked folders are followed first), and refuses the paths Claude Code itself protects: `.git`, `.claude`, `.vscode`, `.idea`, `.husky`, `.devcontainer` and the shell, git and package-manager config files. A refused target stops the call before anything is sent.

## What the two permission rules grant

The rules from [Honest limits](#honest-limits-with-numbers) pre-approve more than their names suggest, because Claude Code cannot see what a subprocess reads or writes:

- `Bash(ccsaver bulk-read *)` reads **any file your user can read**, not only the project's, except the secret-looking ones above. Your own `Read` deny rules and Claude Code's prompt for the first read outside the project do not apply to it. Files inside the plugged root go to your external worker; every other file goes to the Haiku fallback, or nowhere when the fallback is off.
- `Bash(ccsaver code-write *)` creates new files inside the plugged root under the limits above and, when the adapter names a formatter, runs it **from the project's own folder** without a prompt. Plug in only projects whose tooling you trust.
- What comes back is the output of a cheap model that read files you may not have written. The command prints it between `<<<worker-output ID: untrusted data>>>` and `<<<end ID>>>`, with a random ID the worker never sees, so an answer cannot fake its own end; that includes the code of a `code-write` without `--target`, so use `--target` when you want a file. Both skills tell Claude to treat what sits between the markers as data, never as instructions; `code-writer` still runs the generated tests unopened, so review what it wrote before you rely on it. When the written file names a shell, the network or your environment (`child_process`, `fetch(`, `process.env`, `eval(`, `curl`, `rm -rf`…), the command prints a `warn:` line under `wrote …` and the skill tells Claude to read the file before it runs anything. That is a tripwire on a short list of names, not a sandbox.

## The event log

Off by default. `ccsaver log on` creates `~/.config/ccsaver/log/` (700), and from then on the hook and the command append one JSON line per event to `events-YYYY-MM.jsonl` (600). The month, in UTC, is the only rotation, and nothing is ever deleted for you. The folder is the switch: without it nothing is recorded and no file is created. `ccsaver log off` renames the folder to `log.off/` with its data, `ccsaver log on` brings it back, and `rm -rf ~/.config/ccsaver/log ~/.config/ccsaver/log.off` deletes it.

It holds metadata only, and it never leaves your machine:

- `gate`: every `Read` the hook sees in a plugged project, allowed or denied. The path relative to the plugged root (a file outside it is `"inside": false`, with no path), `offset` and `limit`, lines, bytes, the limits and the adapter in force, the decision and its reason (`under`, `lines`, `tokens`, `range`, `binary`, `unreadable`, `malformed`), the milliseconds since the hook's process started, and the ids Claude Code hands the hook (`session_id`, `tool_use_id`, `agent_id`, `agent_type`, `permission_mode`), which are the ones in the session transcript.
- `delegate`: one per `bulk-read` or `code-write`. Mode, number of files and how many sat outside the root, characters sent, who answered, why the external worker did not (`outside`, `no worker`, `no key`, `not https`, `status`, `incomplete`, `length`, `timeout`, `not json`, `unreachable`), HTTP status, milliseconds, characters of the answer, the citation tally, the cost of the fallback, the exit code and, for `code-write`, whether there was a target, what the formatter did, the lines written and how many names tripped the `warn:` line.
- `note` and `fail`: the one-line messages the command prints on stderr, a refusal in an unplugged project included. A mistake on the command line (an unknown option, a folder that is not there, a malformed `worker.json`) is a `fail`, never a `crash`. `config`: `plug`, `unplug`, `worker set` (host and model), `worker claude` (pinned or not, never the path), `fallback`, `log`, and the bare fact of a `key set`. `doctor`: how many `ok`, `warn` and `FAIL` lines. `crash`: name, message and first stack lines of an exception, the ones the hook swallows to let the read through included.

Never recorded: the contents of a file, the worker's answer, the text of `--question` or `--spec`, the key, request headers. A stored key that turns up inside any line, from any command, is written as `[key]`; that holds for keys of 8 characters or more, because replacing anything shorter would eat unrelated text. In an unplugged project the hook records nothing, because it exits before starting Node. A failure to write the log never changes a decision of the hook, an exit code or an output.

Every line carries `v` (the format version), `ts`, `kind`, `session` (`CLAUDE_CODE_SESSION_ID`, or `null` outside Claude Code) and `pid`; a line that would pass 4,000 bytes is replaced by a stub with its size, so one runaway message cannot bloat the log. Processes that write at once do not tear each other's lines: 8 of them appending together left 0 broken lines of 8,000 at 4,000 bytes a line, and 0 of 320 at 1 MB a line (Linux, ext4). While the log is on, the hook also measures the file behind a ranged `Read`, which it otherwise skips. `doctor` leaves one `gate` event per plugged project, marked `"tool_use_id": "doctor"`.

## Environment variables

| Variable | Read by | What for |
| --- | --- | --- |
| `CCSAVER_HOME` | everything | relocates the state folder; the default is `~/.config/ccsaver`, and `XDG_CONFIG_HOME` is not consulted |
| `CLAUDE_PROJECT_DIR` | the hook | the project the session belongs to; the skills get it already expanded by Claude Code, and the command falls back to the working directory |
| `CLAUDE_CODE_EXECPATH` | the fallback, `doctor` | the binary of the running session (undocumented, observed in Claude Code 2.1) |
| `CLAUDE_CODE_SESSION_ID` | the event log | the `session` field of every line |
| `CLAUDE_CODE_CHILD_SESSION` | `doctor` | tells a shell inside a session from one outside (undocumented, observed in 2.1): a `claude` that does not run is a `FAIL` inside and a `warn` outside |

ccsaver sets `NODE_COMPILE_CACHE` (the `cache/` folder of the state folder) for the hook and the command, and four for the fallback: `MAX_THINKING_TOKENS=0`, `CLAUDE_CODE_EFFORT_LEVEL=low`, `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` and `CLAUDE_CODE_PROMPT_CACHE_TTL=5m`.

## Measure it yourself

Run the same prompt twice in headless mode, once with the project plugged and once unplugged, and compare `total_cost_usd` and `duration_ms`:

```bash
claude -p "which functions does src/big-file.ts export?" --output-format json
```

Use several runs per arm; single runs differ by more than the effect you are looking for.

## Uninstall

```bash
ccsaver list                                   # what is still plugged
claude plugin uninstall ccsaver@abgonzalez93
claude plugin marketplace remove abgonzalez93
rm -rf ~/.config/ccsaver                       # your API key and the event log live here
rm ~/bin/ccsaver                               # if you linked the launcher
```

Then delete the two `Bash(ccsaver …)` rules from `permissions.allow` in `~/.claude/settings.json`, if you added them. Nothing was ever written inside your projects.

## Development

```bash
pnpm install
pnpm test        # node --test, no network: a fake server and a fake claude binary
pnpm typecheck
pnpm lint
claude plugin validate .
```

`CCSAVER_HOME` relocates the state folder; the tests use it and nothing else, and `pnpm test` starts from one that does not exist, so a test that forgets its own cannot touch yours.

The rules the code follows, each with the tool that guards it, are in [CONTRIBUTING.md](CONTRIBUTING.md).

### Versions

Every commit is a version. A git hook reads the message of the commit it has just seen, writes the next number into `package.json` and `.claude-plugin/plugin.json`, puts the subject and the bullets of the body on top of `CHANGELOG.md`, and amends that commit with the three files. Nobody types a number or edits the changelog. `feat` moves the second number and anything else the third; a breaking change (`!`, or a `BREAKING CHANGE:` footer) moves the first once it is past 0, and the second until then. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

- It costs 85 ms per commit (p50 of 20, against 3 ms without it). The hash `git commit` prints is the commit before the amend: the hook's own line, `version: 0.2.1, amended as 1a2b3c4`, and `git log -1` have the real one.
- The number is computed from the parent commit, so `git commit --amend` never moves it twice, and rewording `fix` into `feat` moves it again. A version file with changes that are not part of the commit is never swept in: the hook says so and waits for the next `--amend`.
- `git am` of patches made with the hook on lands them untouched, tree for tree; a lone patch without a version gets one.
- Git refuses an amend in the middle of a `cherry-pick` or a `rebase`, and a `git am` of several patches would write its stale index over one, so there the hook stays out, says so and leaves the tree clean. `git rebase --exec 'node scripts/version.ts' HEAD~<commits>` versions those commits afterwards, one by one.
- `CHANGELOG.md` stays readable whole under this project's own gate, 350 lines and 32 KB: when a new section would not fit, the oldest ones fall off the bottom. Nothing is lost, because every section is a commit message and `git log` keeps them all.
- History stays linear. A merge commit gets no version, because both lines of work claim the same numbers, and a commit that already carries a version conflicts on the three version files when it is replayed on a base that has moved.
- Without the hook nothing happens: not in CI, not in an installed plugin, not in a fresh clone. A contributor's commits arrive with no version and get one when the maintainer applies them.

## Origin

The one-shot worker design, the two worker instructions, the framing of the files in the message, the usage note on stderr and the shape of the hook message are adapted from Spotify's `shunt` plugin in [spotify/portal-ai-plugins](https://github.com/spotify/portal-ai-plugins) (Apache-2.0), which targets their Portal platform. ccsaver is a separate implementation with per-project plugging, a privacy boundary, adapters and a fallback worker. See [NOTICE](NOTICE).

## License

[Apache-2.0](LICENSE)
