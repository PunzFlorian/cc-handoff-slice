#!/bin/bash
# Tests for scripts/slices-dir.sh.
#
#   bash tests/slices-dir.test.sh
#
# Builds a normal repo with a linked worktree and a bare repo with two, then
# checks that every worktree resolves to the one shared directory. Needs bash,
# git and jq, like the script.

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
# Resolved, so macOS's /var -> /private/var link matches what git prints.
WORK=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); echo "ok   $1"
  else FAIL=$((FAIL + 1)); echo "FAIL $1"; echo "     expected: $2"; echo "     actual:   $3"; fi
}

# Neither the user's git config nor their handoff-slice config leaks in.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export CLAUDE_CONFIG_DIR="$WORK/config"
mkdir -p "$CLAUDE_CONFIG_DIR"
resolve() { bash "$ROOT/scripts/slices-dir.sh" "$@"; }

# Normal repo, with a space in the path, and a linked worktree beside it.
MAIN="$WORK/my repo"
git init -q -b main "$MAIN"
git -C "$MAIN" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
git -C "$MAIN" worktree add -q -b feat "$WORK/my repo-feat"
mkdir -p "$MAIN/sub"

check 'main worktree'                  "$MAIN/.claude/handoffs" "$(resolve "$MAIN")"
check 'linked worktree shares main'    "$MAIN/.claude/handoffs" "$(resolve "$WORK/my repo-feat")"
check 'a subfolder resolves the same'  "$MAIN/.claude/handoffs" "$(resolve "$MAIN/sub")"
check 'no dir argument uses the cwd'   "$MAIN/.claude/handoffs" "$(cd "$WORK/my repo-feat" && resolve)"
check '--local is the worktree own'    "$WORK/my repo-feat/.claude/handoffs" "$(resolve --local "$WORK/my repo-feat")"

# Opting out: an explicit false must not read as unset (jq's // drops false).
mkdir -p "$WORK/my repo-feat/.claude"
echo '{"shareAcrossWorktrees": false}' > "$WORK/my repo-feat/.claude/handoff-slice.json"
check 'false in the worktree config'   "$WORK/my repo-feat/.claude/handoffs" "$(resolve "$WORK/my repo-feat")"
rm "$WORK/my repo-feat/.claude/handoff-slice.json"

echo '{"shareAcrossWorktrees": false}' > "$CLAUDE_CONFIG_DIR/handoff-slice.json"
check 'false in the global config'     "$WORK/my repo-feat/.claude/handoffs" "$(resolve "$WORK/my repo-feat")"
mkdir -p "$MAIN/.claude"
echo '{"shareAcrossWorktrees": true, "hints": "quiet"}' > "$MAIN/.claude/handoff-slice.json"
check 'base repo config beats global'  "$MAIN/.claude/handoffs" "$(resolve "$WORK/my repo-feat")"
rm "$CLAUDE_CONFIG_DIR/handoff-slice.json" "$MAIN/.claude/handoff-slice.json"

echo 'not json' > "$CLAUDE_CONFIG_DIR/handoff-slice.json"
check 'a broken config keeps the default' "$MAIN/.claude/handoffs" "$(resolve "$WORK/my repo-feat")"
rm "$CLAUDE_CONFIG_DIR/handoff-slice.json"

# Bare repo: every worktree is linked, so slices live in the repo itself.
BARE="$WORK/proj.git"
git init -q --bare -b main "$BARE"
git -C "$MAIN" push -q "$BARE" main
git -C "$BARE" worktree add -q "$WORK/proj-main" main
git -C "$BARE" worktree add -q -b feat "$WORK/proj-feat"
check 'bare: worktree on main'         "$BARE/handoffs" "$(resolve "$WORK/proj-main")"
check 'bare: another worktree'         "$BARE/handoffs" "$(resolve "$WORK/proj-feat")"

# The .bare layout: a bare repo in proj/.bare, a .git file pointing at it.
git clone -q --bare "$BARE" "$WORK/proj2/.bare"
echo 'gitdir: ./.bare' > "$WORK/proj2/.git"
git -C "$WORK/proj2" worktree add -q "$WORK/proj2/main" main
check '.bare layout'                   "$WORK/proj2/.bare/handoffs" "$(resolve "$WORK/proj2/main")"

# The main worktree moved away without git knowing: never write a stub there.
mv "$MAIN" "$WORK/moved"
check 'main worktree gone from disk'   "$WORK/my repo-feat/.claude/handoffs" "$(resolve "$WORK/my repo-feat")"

mkdir -p "$WORK/plain"
check 'outside a git repo'             "$WORK/plain/.claude/handoffs" "$(resolve "$WORK/plain")"
check 'a missing dir still prints a path' "$WORK/plain/.claude/handoffs" "$(cd "$WORK/plain" && resolve "$WORK/nope")"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
