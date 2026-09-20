---
description: Point ccsaver at a cheap worker, store its API key and check the result
---

Set ccsaver up with the user, one step at a time. Ask, then run the command, then report what it printed.

1. **The worker.** Ask for an OpenAI-compatible chat completions URL (`https`, or `localhost`) and a cheap model name, then run `ccsaver worker set <url> <model>`.
2. **The key.** Never ask for it in this conversation and never put it on a command line: both would keep it in the transcript. Ask the user to save the key, alone on one line, in a file only they touch, then run `ccsaver key set < <that file>` followed by `rm <that file>`. Do not read the file, and do not echo it.
3. **The fallback.** Paid Claude Haiku answers what the worker cannot. `ccsaver fallback off` turns that off, `ccsaver fallback on` brings it back.
4. **The check.** Run `ccsaver doctor` and report every `warn` and `FAIL` with what fixes it. `FAIL probe:` means the key or the URL is wrong.

Nothing is delegated until a project is plugged in: tell the user that `/ccsaver:plug` does that, and that it sends whole files from that project to the worker they just configured.
