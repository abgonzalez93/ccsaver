---
description: Point ccsaver at a cheap worker, store its API key and check the result
---

Set ccsaver up with the user, one step at a time. Ask, then run the command, then report what it printed.

1. **The worker.** Ask for an OpenAI-compatible chat completions URL (`https`, or `localhost`) and a cheap model name, then run `ccsaver worker set <url> <model>`.
2. **The key.** Never ask for it in this conversation and never put it on a command line: both would keep it in the transcript. Ask the user to save the key, alone on one line, in a file only they touch, then run `ccsaver key set < <that file>` followed by `rm <that file>`. Do not read the file, and do not echo it.
3. **The fallback.** Paid Claude Haiku answers what the worker cannot. `ccsaver fallback off` turns that off, `ccsaver fallback on` brings it back.
4. **Your own terminal.** Run `ccsaver launcher write`: it puts a launcher at `~/.local/bin/ccsaver`, so a terminal of the user's finds `ccsaver`, and says `already` when it is there. Read its lines back; when a `warn:` names a `PATH` line for the shell profile, show that line and never edit the profile yourself.
5. **The check.** Run `ccsaver doctor` and report every `warn` and `FAIL` with what fixes it. `FAIL probe:` means the key or the URL is wrong.

Nothing is delegated until a project is plugged in: tell the user that `/ccsaver:plug` does that, and that it sends whole files from that project to the worker they just configured.

Plugging also measures the project and says which limits its files ask for. What is specific to one project — house style for the writer, a formatter, the two limits the hook denies at — lives in an adapter, a small JSON file in `~/.config/ccsaver/adapters/`. `ccsaver adapter <name> maxLines=<n> maxTokens=<n>` writes the limits into one without opening an editor, and [docs/configuration.md](../docs/configuration.md#adapters) has the rest of the fields.
