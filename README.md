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
| Citation check in `bulk-read` (one free model, files up to 493 lines, 269 citations in 18 answers) | 268 matched their line, 1 mis-copied hash was tagged, **0 false alarms**, 0 wrong line numbers. Asking for the evidence changes what the worker writes: over 7 questions Claude received 0.7–2.5× the unchecked answer (3 shrank, 4 grew), and the worker itself wrote up to 3.2× more, which took the slowest call from 12 s to 19 s |
| The hook's token estimate (bytes/4) vs the real cost of a whole-file `Read` | the real cost measured **1.9–2.2×** the estimate on batches of 16–27 KB and 2.1–2.8× on batches of small files (Fable 5.1, 9 batches in 2 sessions, line numbers included): the 8,000-token limit lets through reads of about 16,000 real tokens. A denied `Read` costs 136–251 tokens |

Other limits:

- **Linux and macOS only.** The gate is a POSIX `sh` script.
- The cheap worker ignores style rules now and then. That is why `code-writer` treats your project's checks as the reviewer and why adapters can list follow-up commands.
- **Line citations are checked, claims are not.** `bulk-read` asks the worker to end each bullet with the line that proves it, the way `grep -n` prints it, and compares that text with the file: a match is cut down to `path:line`, a quote found on one other line is renumbered, and anything else is tagged `[unverified]`. The note on stderr adds up the three, and says how many answer lines carry no citation at all. What the worker *says* about the code is still the word of a cheap model.
- If most of your files are under 300 lines, the hook will rarely fire and the honest expectation is a small saving.
- **Permission prompts.** Each skill pre-approves its own subcommand and nothing else. Claude Code 2.1.274 applies that grant when you type `/ccsaver:bulk-reader` yourself; when Claude invokes the skill on its own, which is what the hook's message asks for, it registers the grant but does not apply it, so your usual permission flow decides. Answer "don't ask again" once, or add `Bash(ccsaver bulk-read *)` and `Bash(ccsaver code-write *)` to `permissions.allow` in `~/.claude/settings.json`. The rules name the bare command because Claude Code puts the plugin's `bin/` folder on the Bash tool's `PATH`, where it measured as the last entry: they pre-approve whichever `ccsaver` that `PATH` finds first.

## Requirements

Claude Code, Node.js 22.18 or newer (the sources are TypeScript run directly by Node), and a POSIX `sh`.

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
```

`plug` stores the real path and refuses `/`, your home folder and any folder that contains the state folder.

## Point it at a cheap worker

```bash
ccsaver worker set https://your-provider.example/v1/chat/completions some-small-model
ccsaver key set     # typed on the terminal with echo off; never an argument
ccsaver doctor
ccsaver fallback off   # optional: never spend on the Claude Haiku fallback
```

Any OpenAI-compatible chat completions endpoint works; the URL must be `https` (localhost excepted). Without a worker, or whenever it fails, times out or cuts its answer short, the call goes to Claude Haiku through your own Claude Code binary: the one the session runs on (`CLAUDE_CODE_EXECPATH`, an undocumented variable observed in Claude Code 2.1), then `claude` on your `PATH`. `"claude"` in `worker.json` wins over both, so only set it to a path that survives updates: the IDE extensions keep their binary in a versioned folder. A redirect from the worker counts as a failure, never followed with your file in hand. When the fallback itself reports an error, the command fails with that error instead of handing it over as an answer.

The fallback spends your Claude usage, so it is as bare as the worker: no built-in tools and no MCP servers (`--tools ""`, `--strict-mcp-config`), whatever your Claude Code has configured. `ccsaver fallback off` turns it off once a worker is set: a call the worker cannot answer then fails with a one-line error and Claude reads by ranges instead, and a call that names a file outside the plugged root sends nothing anywhere. `ccsaver fallback on` brings it back. The fallback takes at most 400,000 characters of files per call: Haiku's context window is 200,000 tokens and the chars/4 estimate has measured about half of a real count, so a bigger call fails with a one-line error before anything is spent. The external worker has no such cap; its limit is your provider's. Claude Code's documentation says `--bare` will become the default for `-p`, and bare mode does not use a subscription login: on a future version the fallback may need an `ANTHROPIC_API_KEY`.

`doctor` stops at a `node` older than 22.18, checks the permissions of the state folder and the key, sends a one-token probe (200 = the key works, 401/403 = rejected), runs the fallback binary with `--version` (unless the fallback is off), and lists each plugged project with its adapter and limits. For each of them it then feeds the hook a throwaway file one line over the limit, and the `gate:` line fails unless that read is denied. Whether the plugin itself is enabled is Claude Code's to say: `claude plugin list`. It never prints the key or its length. From a terminal outside Claude Code with no `claude` on the `PATH`, the fallback line is a `warn`, not a failure: that shell cannot see the binary a session brings, so run `doctor` from inside one.

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
- Plugged project: a file goes to the external worker only when the real path of **every** file in the call is inside the plugged root. One file outside (a note in your home, a symlink pointing out) sends the whole call to the Haiku fallback instead, or makes it fail when the fallback is off.
- Files that look like secrets (`.env*`, `*.pem`, `*.key`, `id_rsa`, `.npmrc`, `credentials*`, `settings.local.json`, `*.tfstate`…) are refused outright, by given name and by real name, in any letter case. So is any file that holds a private-key header, whatever its name. The list is a net, not a guarantee: a secret pasted into `config.ts` goes out with it.
- `code-write --target` never overwrites an existing file, only writes inside the plugged root (symlinked folders are followed first), and refuses the paths Claude Code itself protects: `.git`, `.claude`, `.vscode`, `.idea`, `.husky`, `.devcontainer` and the shell, git and package-manager config files. A refused target stops the call before anything is sent.

## What the two permission rules grant

The rules from [Honest limits](#honest-limits-with-numbers) pre-approve more than their names suggest, because Claude Code cannot see what a subprocess reads or writes:

- `Bash(ccsaver bulk-read *)` reads **any file your user can read**, not only the project's, except the secret-looking ones above. Your own `Read` deny rules and Claude Code's prompt for the first read outside the project do not apply to it. Files inside the plugged root go to your external worker; every other file goes to the Haiku fallback, or nowhere when the fallback is off.
- `Bash(ccsaver code-write *)` creates new files inside the plugged root under the limits above and, when the adapter names a formatter, runs it **from the project's own folder** without a prompt. Plug in only projects whose tooling you trust.
- What comes back is the output of a cheap model that read files you may not have written. Both skills tell Claude to treat it as data, never as instructions; `code-writer` still runs the generated tests unopened, so review what it wrote before you rely on it.

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
rm -rf ~/.config/ccsaver                       # your API key lives here
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

`CCSAVER_HOME` relocates the state folder; the tests use it and nothing else.

## Origin

The one-shot worker design, the two worker instructions and the shape of the hook message are adapted from Spotify's `shunt` plugin in [spotify/portal-ai-plugins](https://github.com/spotify/portal-ai-plugins) (Apache-2.0), which targets their Portal platform. ccsaver is a separate implementation with per-project plugging, a privacy boundary, adapters and a fallback worker. See [NOTICE](NOTICE).

## License

[Apache-2.0](LICENSE)
