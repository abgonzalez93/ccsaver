#!/bin/sh
# ccsaver launcher 2 · written by ccsaver launcher write · removed by: rm -f ~/.local/bin/ccsaver
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
config=$CLAUDE_CONFIG_DIR
[ -n "$config" ] || config=$HOME/.claude
record=$config/plugins/installed_plugins.json
known=${CCSAVER_HOME:-$HOME/.config/ccsaver}/launcher-root
if [ -f "$record" ] && [ "$known" -nt "$record" ] && IFS= read -r root < "$known" && [ -x "$root/bin/ccsaver" ]; then
  exec "$root/bin/ccsaver" "$@"
fi
command -v node >/dev/null 2>&1 || { echo "Error: ccsaver needs node on the PATH, 22.18+ or 24.2+" >&2; exit 1; }
root=$(node --input-type=module -e '
__INSTALLED_JS__
' "$record") || exit 1
[ -x "$root/bin/ccsaver" ] || { echo "Error: the installed ccsaver is gone from $root: claude plugin update ccsaver@abgonzalez93" >&2; exit 1; }
{ printf '%s\n' "$root" > "$known"; } 2>/dev/null
exec "$root/bin/ccsaver" "$@"
