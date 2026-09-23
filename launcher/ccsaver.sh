#!/bin/sh
# ccsaver launcher 1 · written by ccsaver launcher write · removed by: rm -f ~/.local/bin/ccsaver
set -f
IFS=:
for dir in $PATH; do
  [ -n "$dir" ] || dir=.
  if [ -x "$dir/ccsaver" ] && [ -f "$dir/../.claude-plugin/plugin.json" ]; then
    exec "$dir/ccsaver" "$@"
  fi
done
unset IFS
set +f
command -v node >/dev/null 2>&1 || { echo "Error: ccsaver needs node on the PATH, 22.18+ or 24.2+" >&2; exit 1; }
config=$CLAUDE_CONFIG_DIR
[ -n "$config" ] || config=$HOME/.claude
root=$(node --input-type=module -e '
__INSTALLED_JS__
' "$config/plugins/installed_plugins.json") || exit 1
[ -x "$root/bin/ccsaver" ] || { echo "Error: the installed ccsaver is gone from $root: claude plugin update ccsaver@abgonzalez93" >&2; exit 1; }
exec "$root/bin/ccsaver" "$@"
