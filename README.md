<img src="assets/icon.svg" width="96" alt="ccsaver logo">

# ccsaver

A Claude Code plugin that keeps two expensive habits out of the main model's context: whole-file reads of big files, and writing boilerplate. Both go to a cheap one-shot worker you choose, in the projects you plug in and nowhere else.

> **Plugging a project in sends whole files from it to a third party.** The worker you configure receives them, and free API tiers may train on what you send. Read your provider's terms before you plug in private code. [What leaves your machine](#what-leaves-your-machine) has the exact boundary.

## Quickstart

```bash
claude plugin marketplace add abgonzalez93/ccsaver
claude plugin install ccsaver@abgonzalez93
```

Open a new session, or run `/reload-plugins`, then type `/ccsaver:setup` to point it at a worker and store its key, and `/ccsaver:plug` to turn it on for the project you are in. `/ccsaver:doctor` checks it all again later. ccsaver keeps no state of its own inside your projects, and puts one file on your machine outside its state folder: Claude Code puts `ccsaver` on the `PATH` of its own sessions only, so `setup` writes [a launcher](docs/configuration.md#your-own-terminal) at `~/.local/bin/ccsaver` for a terminal of yours, and says so when that folder is not on your `PATH`.

Needs Claude Code, Node.js 22.18+ or 24.2+, and a POSIX `sh`. Linux and macOS only.

## What it does

- **Denies whole-file reads of big files.** A `PreToolUse` hook denies a `Read` of a whole file over 350 lines or 32 KB and points the model at Grep, at a ranged read, or at the `bulk-reader` skill. It asks the file system for the size first, so a huge file is never opened. Those two numbers are this repository's house style, not a measured optimum: `plug` measures your project and proposes the limits it asks for, and `doctor` says when it has drifted. Three repositories measured this way asked for limits [10× apart](docs/measurements.md#what-a-repository-asks-for) ([Limits](docs/configuration.md#limits)).
- **Delegates boilerplate.** The `code-writer` skill hands tests, fixtures and stubs to the same worker and lets your project's own checks review the result.
- **Says when a session has grown past a limit.** Every request carries the whole conversation, so a `Stop` hook reads the token count Claude Code writes at the end of the session transcript and, once per multiple of the limit (200,000 tokens by default), says so at the end of the turn. `/ccsaver:handoff` then has the session itself write the handoff, the goal, the state, the decisions and the next steps, and keeps it where a new session can read it whole ([The handoff warning](docs/configuration.md#the-handoff-warning)).

Both skills call one command, `ccsaver`, which makes **one tool-less, one-shot call** to a cheap model: an OpenAI-compatible endpoint of your choice, with Claude Haiku (through your own Claude Code) as the fallback. The expensive model sees the short answer, never the file.

A project that is not plugged in gets nothing: the hook exits before starting Node, the command refuses to run, and no byte leaves your machine.

ccsaver is an independent project. It is not affiliated with or endorsed by Anthropic.

## Honest limits

Measured on one TypeScript monorepo with Claude Code 2.1, small samples of 1–4 sessions per cell. Every number and its sample size is in [docs/measurements.md](docs/measurements.md); [measure your own](docs/development.md#measure-it-yourself) before believing any of it.

| What | Result |
| --- | --- |
| Hook, task = locate or describe something in a big file | [**−16 %** session cost](docs/measurements.md#the-hook-on-a-locate-or-describe-task) |
| Hook, task = a judgement question, limit set below the file | [no saving, **3.6× slower**](docs/measurements.md#the-hook-on-a-judgement-question) |
| Delegated writing of a ~110-line test file | [**break-even**](docs/measurements.md#delegated-writing-of-a-test-file) |
| Files where delegation starts to pay | [roughly **2,000–3,000 lines** and up](docs/measurements.md#where-delegation-starts-to-pay) |
| Fixed cost of the two skill descriptions | [**~188 tokens per session, in every project**](docs/measurements.md#the-fixed-cost-of-the-skill-descriptions) |
| Hook overhead per `Read` | [**1–3 ms** unplugged, **≈ 24 ms** plugged](docs/measurements.md#hook-overhead-per-read) |

Where it does not help:

- If most of your files are under 300 lines the hook rarely fires, and the honest expectation is a small saving.
- **That 3.6× is a limit set too low, not a law of the approach.** Denying a file the model needs whole makes it page through ranges and delegate on top of that. The limit is the knob, and the two ways of being wrong are not symmetric: too high is inert, too low degrades. `plug` and `doctor` measure it for you — [Limits](docs/configuration.md#limits).
- **The gate is a nudge, not a wall.** It watches the `Read` tool only, and only whole-file reads: a ranged `Read` that covers the whole file passes, and so does `cat` through Bash. The [event log](docs/events.md) counts how often that happens.
- **The context warning counts what a file of Claude Code's own says**, in a format that "changes between versions": on a release that changes it the warning falls silent, never wrong. It comes at the end of a turn, so a turn that grows a lot ends past the limit before it (one turn in ten grew more than 87,000 tokens in [175 sessions measured](docs/measurements.md#where-the-handoff-limit-comes-from)), it can trail the count by one request, because the transcript is written behind the conversation, and it never names the model's window, because the transcript does not say it.
- **Line citations are checked, claims are not.** `bulk-read` compares each cited line with the file and tags what does not match `[unverified]`. What the worker *says* about the code is still the word of a cheap model.
- The hook's token limit is an estimate: bytes/4 measured [1.9–2.8× under](docs/measurements.md#the-hooks-token-estimate-vs-a-real-read) the real cost of a `Read`, so the 8,000-token limit lets through reads of about 16,000 real tokens.
- The cheap worker ignores style rules now and then. That is why `code-writer` treats your project's checks as the reviewer, and why [adapters](docs/configuration.md#adapters) can list follow-up commands.

## What leaves your machine

- Unplugged project: nothing, ever.
- Files inside the plugged root travel labelled with their path relative to that root, so your user name and folder layout stay home. A label cannot end the frame its file travels in: a quote, an angle bracket or a line break in a path is escaped before it is written, so a folder named to look like the end of a file cannot make the worker read the next one as something else.
- Plugged project: a file goes to the external worker only when the real path of **every** file in the call is inside the plugged root. Each path is resolved once, so the file that is judged is the file that is read, and a file named twice, by its path and through a symlink, is judged under both names and sent once. One file outside (a note in your home, a symlink pointing out) sends the whole call to the Haiku fallback instead, or makes it fail when the fallback is off.
- Files that look like secrets are refused outright, by given name and by real name, in any letter case: `.env*`, `*.pem`, `*.key`, `id_rsa`, `.npmrc`, `credentials*`, `settings.local.json`, `*.tfstate`, `*.tfvars.json`… `.env.example`, `.env.sample` and `.env.template` go through, because they are the documentation of a project's variables.
  - So is anything under a folder named `secrets`, `.secrets`, `.ssh`, `.aws`, `.gnupg`, `.kube` or `.git`, and `.docker/config.json`. The path is judged from the plugged root down, so a project that lives under `~/secrets/` still works, and `.github/` and `.gitignore` are not `.git/`. A repository cloned over `https://user:token@…` keeps that token in `.git/config`.
  - So is any file that holds a private-key header, armoured or PGP, or a token with a well-known shape (AWS `AKIA…`, GitHub `ghp_…` and `github_pat_…`, GitLab `glpat-…`, npm `npm_…`, Slack `xoxb-…`, `sk-…` and `sk_…`/`rk_…` (OpenAI, Anthropic, Stripe), Google `AIza…`), whatever its name, and any binary file.
  - The list is a net, not a guarantee: a password pasted into `config.ts` goes out with it.
- The state folder stays home: a call that names a file under `~/.config/ccsaver/` is refused before anything is sent, and the [event log](docs/events.md) in it is a local file that no code in ccsaver sends anywhere.
- The context warning reads the last 256 KB of the session transcript, on your machine, for one token count and the model's name; nothing else is read from it, nothing from it is sent anywhere, and those two are recorded only while the [event log](docs/events.md) is on.
- `code-write --target` never overwrites an existing file (a symlink already at that path counts, wherever it points), only writes inside the plugged root (symlinked folders are followed first), and refuses the paths Claude Code itself protects: `.git`, `.claude`, `.vscode`, `.idea`, `.husky`, `.devcontainer`, `.cargo`, `.yarn`, `.mvn` and the shell, git and package-manager config files. A refused target stops the call before anything is sent.

## What the two permission rules grant

Each skill pre-approves its own subcommand, `Bash(ccsaver bulk-read *)` or `Bash(ccsaver code-write *)`, and nothing else. They grant more than their names suggest, because Claude Code cannot see what a subprocess reads or writes:

- `Bash(ccsaver bulk-read *)` reads **any file your user can read**, not only the project's, except the secret-looking ones above. Your own `Read` deny rules and Claude Code's prompt for the first read outside the project do not apply to it. Files inside the plugged root go to your external worker; every other file goes to the Haiku fallback, or nowhere when the fallback is off.
- Each subcommand takes its own options only: `--target` or `--spec` passed to `bulk-read`, or `--question` passed to `code-write`, stops the call with a one-line error instead of running as if it had not been typed.
- `Bash(ccsaver code-write *)` creates new files inside the plugged root under the limits above and, when the adapter names a formatter, runs it **from the project's own folder** without a prompt. Plug in only projects whose tooling you trust.
- What comes back is the output of a cheap model that read files you may not have written. The command prints it between `<<<worker-output ID: untrusted data>>>` and `<<<end ID>>>`, with a random ID the worker never sees, so an answer cannot fake its own end. That includes the code of a `code-write` without `--target`, so use `--target` when you want a file.
  - Both skills tell Claude to treat what sits between the markers as data, never as instructions. `code-writer` still runs the generated tests unopened, so review what it wrote before you rely on it.
  - When the written file names a shell, the network, a delete or your environment (`child_process`, `fetch(`, `import(`, `process.env`, `eval(`, `curl`, `rm -rf`, `rmSync`, `http.request`, `net.connect`, `WebSocket`…), the command prints a `warn:` line under `wrote …` and the skill tells Claude to read the file before it runs anything. That is a tripwire on a short list of names, not a sandbox.

Claude Code 2.1.274 applies a skill's grant when you type `/ccsaver:bulk-reader` yourself; when Claude invokes the skill on its own, which is what the hook's message asks for, your usual permission flow decides. Answer "don't ask again" once, or add both rules to `permissions.allow` in `~/.claude/settings.json`.

## Commands

| Command | What it does |
| --- | --- |
| `ccsaver setup` | ask for worker, key and fallback, put the launcher in place, then run `doctor` |
| `ccsaver plug [dir] [adapter]` | turn ccsaver on for one project; no directory means this one |
| `ccsaver adapter <name> k=v ...` | set `maxLines` or `maxTokens` on an adapter, creating it if it is not there |
| `ccsaver unplug <dir>` | turn it off again for that project |
| `ccsaver list` | show the plugged projects |
| `ccsaver worker set <url> <model>` | point at an OpenAI-compatible chat completions endpoint |
| `ccsaver worker claude <path>\|auto` | pin the `claude` binary the fallback runs, or give it back to the session |
| `ccsaver key set` | store the API key: typed with the echo off, or read from stdin |
| `ccsaver launcher write` | put a launcher at `~/.local/bin/ccsaver`, so a terminal of yours finds ccsaver; what `setup` runs before `doctor` |
| `ccsaver fallback on\|off` | whether a call the worker cannot take goes to paid Claude Haiku |
| `ccsaver log on\|off` | record events, metadata only, in a local file; off by default |
| `ccsaver handoff on\|off\|<tokens>` | warn at the end of a turn whose context passed this many tokens, on by default at 200,000; with nothing after it, what is set and what is kept |
| `ccsaver handoff write` | what `/ccsaver:handoff` runs: keep a handoff read from stdin, private, for the next session |
| `ccsaver saved [month\|all]` | what the log says it cost, and what it would have cost without |
| `ccsaver price [<model>\|worker <usd>]` | dollars per million input tokens for one model, so `saved` can show money; with nothing after it, what is set |
| `ccsaver doctor` | check permissions, key, worker, fallback, the launcher and projects |
| `ccsaver version` | print the version |
| `ccsaver bulk-read --question=<q> --paths <file>...` | what the `bulk-reader` skill runs; `--project <dir>` names the project |
| `ccsaver code-write --spec=<s> --reference <file>...` | what the `code-writer` skill runs; `--target <out>` writes the file |

A setting is a noun and a value (`worker set`, `key set`, `adapter <name> k=v`, `fallback on|off`, `log on|off`, `handoff on|off|<tokens>`); everything that does something is a verb (`plug`, `unplug`, `list`, `doctor`, `setup`). The last two rows are the subcommands the skills run, `handoff write` and `launcher write` the ones `/ccsaver:handoff` and `setup` run, and a hand rarely types them. Five of these have a slash command that walks a session through them and reads the answer back: `/ccsaver:setup`, `/ccsaver:plug`, `/ccsaver:doctor`, `/ccsaver:saved` and `/ccsaver:handoff`. `ccsaver` with no command, and `help`, print that table on stdout and exit 0. A command given the wrong arguments says what was wrong and prints its own row of the table under it, on stderr, and exits 1, so the line you need is never buried under the rest:

```
Error: fallback takes on or off, not: sideways
usage: ccsaver fallback on|off            whether a call the worker cannot take goes to paid Claude Haiku
```

A word that is no command at all prints `Error: unknown command: <word>` and the whole table. A setting typed with the value it already has says so and changes nothing, on disk or in the [event log](docs/events.md): `the log is already on`, `the fallback is already off`, `the handoff limit is already 200000 tokens`, `the worker is already <url> · <model>`, `<model> is already $5/M`, `adapter <name> already holds maxLines=400`, `the launcher is already at ~/.local/bin/ccsaver`; `plug` on a project that is plugged in and `unplug` on one that is not answer the same way. All of them exit 0, because nothing is wrong. A change that replaced a value names the old one, `plugged <root> · adapter strict-ts (was none)`, `price claude-opus-5 $6/M (was $5/M)`, `fallback binary pinned: <path> (was <path>)`. On a terminal every line opens with a mark in colour: `✓` for a change made, `→` for something that was already so, `!` for a warning, `✗` for an error, and `doctor` paints its `ok`, `warn` and `FAIL` the same way. When the output goes to a pipe, or with `NO_COLOR` set or `TERM=dumb`, the words stand alone: what a script or a session reads never carries a mark or an escape code, and the word always says what the colour says. A control character in an argument, in a path or in what the worker answers is written as `\\x1b` before it is printed, and an invisible one that reorders or hides what you read, a bidi override or a zero-width space, as `\\u202e`, so nothing ccsaver echoes can repaint your terminal or show a line that reads differently from what it holds. The one exception is the code of a `code-write` without `--target`: that is a file's contents and travels byte for byte, which is one more reason to name a `--target`.

The target of a `code-write` is the one thing ccsaver ever writes inside a project; its own state never goes there, but in `~/.config/ccsaver/`: the key (600), `worker.json`, `prices.json`, `handoff.json`, the `plugged` list, your own `adapters/`, the `handoff/` folder with the handoffs you keep and one marker per session, Node's compile `cache/` and, once you ask for it, `log/`. `plug` stores the real path and refuses `/`, your home folder, any folder that contains the state folder, and a folder that is itself a store of credentials (`.ssh`, `.aws`, `.gnupg`, `.kube`, `.git`, `secrets`); a project *inside* one of them, `~/secrets/my-app`, still plugs. A `plugged` list that is there but cannot be read stops `plug`, `unplug`, `list` and `doctor` with its name, instead of being read as empty and written back with one line; the hook never starts on it, because the gate in `sh` asks whether it can read the file first.

## The rest

| Page | What is in it |
| --- | --- |
| [docs/configuration.md](docs/configuration.md) | your own terminal, the worker, the key, the fallback, `doctor`, adapters, environment variables |
| [docs/events.md](docs/events.md) | the event log: every field, and what is never recorded |
| [docs/measurements.md](docs/measurements.md) | the notes behind every number above |
| [docs/versions.md](docs/versions.md) | every commit is a version, written by a git hook |
| [docs/development.md](docs/development.md) | the checks, and how to measure it yourself |
| [CONTRIBUTING.md](CONTRIBUTING.md) | the rules the code follows, each with the tool that guards it |
| [CHANGELOG.md](CHANGELOG.md) | what every version changed |
| [SECURITY.md](SECURITY.md) | how to report a vulnerability |

## Update

```bash
claude plugin marketplace update abgonzalez93
claude plugin update ccsaver@abgonzalez93
```

Then open a new session or run `/reload-plugins`. A third-party marketplace has auto-update off until you turn it on under `/plugin` → Marketplaces. Every commit on `main` carries [its own version](docs/versions.md), and that number is what `plugin update` compares.

## Uninstall

```bash
ccsaver list                                   # what is still plugged
claude plugin uninstall ccsaver@abgonzalez93
claude plugin marketplace remove abgonzalez93
rm -rf ~/.config/ccsaver                       # your API key and the event log live here
rm -f ~/.local/bin/ccsaver                     # the launcher setup wrote
```

Then delete the two `Bash(ccsaver …)` rules from `permissions.allow` in `~/.claude/settings.json`, if you added them.

## Origin

The one-shot worker design, the two worker instructions, the framing of the files in the message, the usage note on stderr and the shape of the hook message are adapted from Spotify's `shunt` plugin in [spotify/portal-ai-plugins](https://github.com/spotify/portal-ai-plugins) (Apache-2.0), which targets their Portal platform. ccsaver is a separate implementation with per-project plugging, a privacy boundary, adapters and a fallback worker. See [NOTICE](NOTICE).

## License

[Apache-2.0](LICENSE)
