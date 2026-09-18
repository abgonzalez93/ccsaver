# ccsaver

A Claude Code plugin that keeps two expensive habits out of the main model's context, only in the projects you plug in:

- **Whole-file reads of big files.** A `PreToolUse` hook denies a `Read` of a whole file over 350 lines or ~8,000 tokens and points the model at Grep, at a ranged read, or at the `bulk-reader` skill.
- **Boilerplate writing.** The `code-writer` skill hands tests, fixtures and stubs to a cheap worker and lets your project's own checks review the result.

Both skills call one command, `ccsaver`, which makes **one tool-less, one-shot call** to a cheap model: an OpenAI-compatible endpoint of your choice, with Claude Haiku (through your own Claude Code) as the fallback. The expensive model sees the short answer, never the file.

A project that is not plugged in gets nothing: the hook exits before starting Node, the command refuses to run, and no byte leaves your machine.

ccsaver is an independent project. It is not affiliated with or endorsed by Anthropic.

## Honest limits, with numbers

Measured on one TypeScript monorepo with Claude Code 2.1, small samples (1–4 sessions per cell). Treat them as a starting point and [measure your own](#measure-it-yourself).

| What | Result |
| --- | --- |
| Hook, task = locate or describe something in a big file | **−16 %** session cost (0.58 $ vs 0.69 $; replicated 0.60 / 0.56 $ vs 0.72 / 0.66 $) |
| Hook, task = a judgement question about the file | no saving, **3.6× slower** (230 s vs 64 s): the model pages through ranges and delegates on top |
| Delegated writing of a ~110-line test file | **break-even**: 0.80–1.02 $ vs 0.85 $ written directly; the cost is the review, not the writing |
| Files where delegation starts to pay | roughly **2,000–3,000 lines** and up |
| Fixed cost of the two skill descriptions | **+180 tokens per session, in every project** (≈ 0.006 $ on a frontier model) |
| Hook overhead per `Read` (mean of 30, process spawn included) | **1–3 ms** in an unplugged project (the `sh` gate exits before starting Node), **≈ 22 ms** in a plugged one (Node start-up with its compile cache; 49 ms without it) |
| One-shot worker vs a subagent for the same read | 4–8 s and 0.03–0.07 $ vs 26–169 s and up to 0.14 $ |

Other limits:

- **Linux and macOS only.** The gate is a POSIX `sh` script.
- **Free API tiers may train on what you send.** Read your provider's terms before plugging in private code.
- The cheap worker ignores style rules now and then. That is why `code-writer` treats your project's checks as the reviewer and why adapters can list follow-up commands.
- If most of your files are under 300 lines, the hook will rarely fire and the honest expectation is a small saving.

## Requirements

Claude Code, Node.js 22.18 or newer (the sources are TypeScript run directly by Node), and a POSIX `sh`.

## Install

```bash
claude plugin marketplace add abgonzalez93/ccsaver
claude plugin install ccsaver@abgonzalez93
```

If you want the `ccsaver` command in your terminal (you do: it is how you plug projects in), clone the repository, add the clone as the marketplace instead, and link the launcher:

```bash
git clone https://github.com/abgonzalez93/ccsaver ~/src/ccsaver
claude plugin marketplace add ~/src/ccsaver
claude plugin install ccsaver@abgonzalez93
ln -s ~/src/ccsaver/bin/ccsaver ~/bin/ccsaver
```

A plugin installed from a local folder loads in place, so the path stays stable across updates.

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
worker.json   { "url", "model", "claude"? }
plugged       one line per project: <real path><TAB><adapter>
adapters/     your own adapters (optional)
cache/        Node's compile cache for the hook
```

`plug` stores the real path and refuses `/`, your home folder and any folder that contains the state folder.

## Point it at a cheap worker

```bash
ccsaver worker set https://your-provider.example/v1/chat/completions some-small-model
ccsaver key set     # typed on the terminal with echo off; never an argument
ccsaver doctor
```

Any OpenAI-compatible chat completions endpoint works; the URL must be `https` (localhost excepted). Without a worker, or whenever it fails, times out or cuts its answer short, the call goes to Claude Haiku through your own Claude Code binary. Set `"claude"` in `worker.json` when that binary is not on your `PATH`.

`doctor` checks the permissions of the state folder and the key, sends a one-token probe (200 = the key works, 401/403 = rejected), runs the fallback binary with `--version`, and lists each plugged project with its adapter and limits. It never prints the key or its length.

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

Every field is optional. `format` runs from the project root with the written file appended; `after` lines are printed as `next:` commands for the model to run; `maxLines` and `maxTokens` move the hook's thresholds. [`adapters/strict-ts.json`](adapters/strict-ts.json) is a working example: with those rules the worker imported from the right module in 4 of 4 runs, against 0 of 4 without them.

## What leaves your machine

- Unplugged project: nothing, ever.
- Files inside the plugged root travel labelled with their path relative to that root, so your user name and folder layout stay home.
- Plugged project: a file goes to the external worker only when the real path of **every** file in the call is inside the plugged root. One file outside (a note in your home, a symlink pointing out) sends the whole call to the Haiku fallback instead.
- Files that look like secrets (`.env*`, `*.pem`, `*.key`, `id_rsa`, `.npmrc`, `credentials*`, `settings.local.json`…) are refused outright, by given name and by real name.
- `code-write --target` never overwrites an existing file.

## Measure it yourself

Run the same prompt twice in headless mode, once with the project plugged and once unplugged, and compare `total_cost_usd` and `duration_ms`:

```bash
claude -p "which functions does src/big-file.ts export?" --output-format json
```

Use several runs per arm; single runs differ by more than the effect you are looking for.

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
