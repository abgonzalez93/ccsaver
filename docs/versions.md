# Versions

Every commit on `main` carries its own number, written by a git hook. [CHANGELOG.md](../CHANGELOG.md) is what it writes.

Every commit is a version. A git hook reads the message of the commit it has just seen, writes the next number into `package.json` and `.claude-plugin/plugin.json`, puts the subject and the bullets of the body on top of `CHANGELOG.md`, amends that commit with the three files and tags it `v<number>`. Nobody types a number, edits the changelog or makes a tag. `feat` moves the second number and anything else the third; a breaking change (`!`, or a `BREAKING CHANGE:` footer) moves the first once it is past 0, and the second until then. It needs Node.js 24.2, the floor `package.json` declares: `scripts/version.ts` runs on `import.meta.main`, which 24.0 and 24.1 leave undefined, so on those it runs, versions nothing and says nothing. Turn it on once per clone:

```bash
git config core.hooksPath .githooks
```

- It costs 85 ms per commit (p50 of 20, against 3 ms without it). The hash `git commit` prints is the commit before the amend: the hook's own line, `version: 0.2.1, amended as 1a2b3c4, tagged v0.2.1`, and `git log -1` have the real one.
- The tag is annotated, so `git push --follow-tags` carries the tags with the commits. A `v*.*.0` tag arriving at GitHub is turned into a release by `.github/workflows/release.yml`, with that version's section of `CHANGELOG.md` as its notes; a patch tag is not, because the changelog already has it. A release changes nothing about installing the plugin, which reads the repository through the marketplace. An `--amend` moves the tag to the commit that replaced the old one, and deletes the tag it orphaned when a reworded type changed the number, so `git tag --no-merged HEAD` stays empty. Commits made before the hook started tagging carry no tag; their number is in their own `package.json` all the same.

A minor tag older than the workflow never fired it, and nothing fires it later: `v0.1.0` through `v0.6.0` predate `.github/workflows/release.yml`, so those releases are missing and will stay missing until someone makes them. The same is true of any tag whose run failed. One loop fills every gap, skipping what is already there and taking its notes from the same section of `CHANGELOG.md` the workflow would, which holds every version back to the first commit:

```bash
for tag in $(git tag --list 'v*.*.0' | sort -V); do
  gh release view "$tag" >/dev/null 2>&1 && continue
  awk -v v="${tag#v}" 'index($0, "## " v " ") == 1 || $0 == "## " v {f = 1; next} /^## /{f = 0} f' \
    CHANGELOG.md | sed '/./,$!d' > notes.md
  gh release create "$tag" --title "$tag" --notes-file notes.md
done
rm -f notes.md
```

It is safe to run again: a tag that already has a release is skipped. Missing releases cost nothing but tidiness, because the plugin installs by reading the repository through the marketplace, never from a release asset.
- The number is computed from the parent commit, so `git commit --amend` never moves it twice, and rewording `fix` into `feat` moves it again. A version file with changes that are not part of the commit is never swept in: the hook says so and waits for the next `--amend`.
- `git am` of patches made with the hook on lands them untouched, tree for tree; a lone patch without a version gets one.
- Git refuses an amend in the middle of a `cherry-pick` or a `rebase`, and a `git am` of several patches would write its stale index over one, so there the hook stays out, says so and leaves the tree clean. `git rebase --exec 'node scripts/version.ts' HEAD~<commits>` versions those commits afterwards, one by one.
- `CHANGELOG.md` holds every version, back to the first commit, in one file. Nothing falls off the bottom, and it grows without a ceiling: it is the one document besides `pnpm-lock.yaml` that this project's own 350-line gate excuses, because a changelog is read from the top and never whole. Its last section is 0.1.0, the seventeen commits made before this hook existed, rebuilt from `git log`.
- History stays linear. A merge commit gets no version, because both lines of work claim the same numbers, and a commit that already carries a version conflicts on the three version files when it is replayed on a base that has moved.
- Without the hook nothing happens: not in CI, not in an installed plugin, not in a fresh clone. A contributor's commits arrive with no version and get one when the maintainer applies them.
