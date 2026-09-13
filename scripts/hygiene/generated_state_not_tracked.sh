#!/usr/bin/env sh
# Fail if generated agent-harness state is tracked or staged.
#
# WHY THIS EXISTS
# `.claude-flow/policy/state.json` is generated per-directory by a concurrent
# agent harness. On 2026-09-13 six copies existed in this working tree, at six
# different depths, none tracked and none ignored:
#
#   .claude-flow/policy/state.json
#   app/.claude-flow/policy/state.json
#   app/frontend/.claude-flow/policy/state.json
#   app/frontend/src/components/.claude-flow/policy/state.json
#   app/frontend/src/components/__tests__/.claude-flow/policy/state.json
#   app/frontend/src/pages/.claude-flow/policy/state.json
#
# Untracked-but-not-ignored is the dangerous state: a single `git add -A` from
# any concurrent lane commits all six into the repository. The .gitignore rule
# added alongside this script prevents that; this script is the regression check
# proving the rule still holds, because a .gitignore entry can be deleted,
# overridden by a later negation, or bypassed with `git add -f`.
#
# Ignoring is NOT the same as being untracked: `.gitignore` has no effect on a
# path that is already tracked. So this checks the INDEX, not the ignore rules.
#
# Exit 0 = clean. Exit 1 = generated state is tracked or staged.

set -eu

PATTERN='\.claude-flow/policy/state\.json$'
status=0

tracked="$(git ls-files | grep -E "$PATTERN" || true)"
if [ -n "$tracked" ]; then
  echo "FAIL: generated harness state is TRACKED:" >&2
  printf '  %s\n' $tracked >&2
  echo "  Remove with: git rm --cached <path>  (the .gitignore rule alone will NOT untrack it)" >&2
  status=1
fi

staged="$(git diff --cached --name-only | grep -E "$PATTERN" || true)"
if [ -n "$staged" ]; then
  echo "FAIL: generated harness state is STAGED:" >&2
  printf '  %s\n' $staged >&2
  echo "  Unstage with: git restore --staged <path>" >&2
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "PASS: no generated harness state tracked or staged"
fi
exit "$status"
