---
name: bulk-reader
description: "Delegate bulk file reading to a cheap one-shot worker. Use when a Read is denied by the file-size hook, to answer one question across 3+ files, or to digest long notes. Locating or counting is Grep's job; debugging and editing stay with you."
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/bin/ccsaver bulk-read *)
license: Apache-2.0
metadata:
  notice: "Contains material adapted from a third-party Apache-2.0 work; modified. See NOTICE in the plugin root."
---

```bash
${CLAUDE_PLUGIN_ROOT}/bin/ccsaver bulk-read --project "${CLAUDE_PROJECT_DIR}" --question "<question>" --paths <file1> [<file2> ...]
```

Each call is independent. To ask a follow-up, ask again with the same `--paths` — the files go to the worker, never into your context, so re-sending them costs you nothing.

The worker sees numbered lines; verify a line number or an exact value with a ranged Read before using it in an edit.

`Error: … is not plugged in` means the owner keeps this project away from the worker: answer from ranged Reads instead.
