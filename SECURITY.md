# Security policy

ccsaver sends files from the projects you plug in to a model you chose, stores an API key and writes files on the word of an untrusted model. A hole in any of those is a security bug, and it is welcome here.

## Reporting

Report it in private through GitHub: [Report a vulnerability](https://github.com/abgonzalez93/ccsaver/security/advisories/new). Please do not open a public issue for it.

Include the version (`ccsaver version`), the command or the hook input that triggers it, what you expected and what happened. A failing test against `test/` is the best report there is.

Only the latest version gets fixes.

## What counts

- A file reaching the external worker that the README says stays home: a file outside the plugged root, a file the secrets net names, anything in the state folder.
- The API key showing up anywhere but `~/.config/ccsaver/api-key`: an argument, a log line, an error message, a URL that is not `https`.
- `code-write --target` writing outside the plugged root, over an existing file, or into a path the README lists as protected.
- An answer that escapes its `<<<worker-output ID>>>` markers, or text from the worker printed outside them.
- The hook denying or crashing in a project that is not plugged in.
- A `fallback off` that still reaches the paid fallback.

## What does not

The limits the README states on purpose: the secrets net is a net, the `warn:` line is a tripwire on a short list of names, the gate is a nudge that a ranged `Read` or `cat` walks around, and `Bash(ccsaver bulk-read *)` reads any file your user can read. Better nets are welcome as ordinary issues and pull requests.
