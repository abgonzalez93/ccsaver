# Versions

Every commit on `main` carries its own number, written by a git hook. [CHANGELOG.md](../CHANGELOG.md) is what it writes.

Every commit is a version. A git hook reads the message of the commit it has just seen, writes the next number into `package.json` and `.claude-plugin/plugin.json`, puts the subject and the bullets of the body on top of `CHANGELOG.md`, and amends that commit with the three files. Nobody types a number or edits the changelog. `feat` moves the second number and anything else the third; a breaking change (`!`, or a `BREAKING CHANGE:` footer) moves the first once it is past 0, and the second until then. It needs Node.js 24.2, the floor `package.json` declares: `scripts/version.ts` runs on `import.meta.main`, which 24.0 and 24.1 leave undefined, so on those it runs, versions nothing and says nothing. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

- It costs 85 ms per commit (p50 of 20, against 3 ms without it). The hash `git commit` prints is the commit before the amend: the hook's own line, `version: 0.2.1, amended as 1a2b3c4`, and `git log -1` have the real one.
- The number is computed from the parent commit, so `git commit --amend` never moves it twice, and rewording `fix` into `feat` moves it again. A version file with changes that are not part of the commit is never swept in: the hook says so and waits for the next `--amend`.
- `git am` of patches made with the hook on lands them untouched, tree for tree; a lone patch without a version gets one.
- Git refuses an amend in the middle of a `cherry-pick` or a `rebase`, and a `git am` of several patches would write its stale index over one, so there the hook stays out, says so and leaves the tree clean. `git rebase --exec 'node scripts/version.ts' HEAD~<commits>` versions those commits afterwards, one by one.
- `CHANGELOG.md` stays readable whole under this project's own gate, 350 lines and 32 KB, and a section that no longer fits is filed, never dropped: the hook puts it on top of the newest file in `docs/changelog/` and starts the next one when that file is full, so every file stays under the same gate. A version lives in exactly one of them. `docs/changelog/1.md` opens with 0.1.0, the seventeen commits made before the hook existed, rebuilt from `git log`.
- History stays linear. A merge commit gets no version, because both lines of work claim the same numbers, and a commit that already carries a version conflicts on the three version files when it is replayed on a base that has moved.
- Without the hook nothing happens: not in CI, not in an installed plugin, not in a fresh clone. A contributor's commits arrive with no version and get one when the maintainer applies them.
