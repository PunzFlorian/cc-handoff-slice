#!/bin/bash
# Prints the absolute directory that holds this repo's handoff slices.
#
#   bash slices-dir.sh [dir]           where slices live for the repo at dir
#   bash slices-dir.sh --local [dir]   that worktree's own .claude/handoffs
#
# dir defaults to the working directory. Every worktree of a repo shares one
# directory, so a slice outlives the worktree it was cut in:
#   - the main worktree's .claude/handoffs/
#   - <bare repo>/handoffs/ when the repo is bare (no worktree is permanent)
#   - the worktree's own .claude/handoffs/ when shareAcrossWorktrees is false,
#     outside git, or when the main worktree is gone from disk
#
# Always prints a path and exits 0: callers build paths on top of it.
# hooks/register.tsx (slicesDir) resolves the same way: change both together.

LOCAL_ONLY=
if [ "${1:-}" = --local ]; then LOCAL_ONLY=1; shift; fi

DIR=$(cd "${1:-.}" 2>/dev/null && pwd) || DIR=$PWD
ROOT=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null) || ROOT=$DIR
OWN="$ROOT/.claude/handoffs"
[ -n "$LOCAL_ONLY" ] && { printf '%s\n' "$OWN"; exit 0; }

# The first entry is the main worktree, or the bare repo itself.
FIRST=$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | sed '/^$/q')
MAIN=$(printf '%s\n' "$FIRST" | sed -n '1s/^worktree //p')
[ -n "$MAIN" ] || { printf '%s\n' "$OWN"; exit 0; }

# The first file that sets shareAcrossWorktrees decides; true by default.
# Not `.x // empty`: jq's // treats false as missing.
shared() {
  command -v jq >/dev/null 2>&1 || return 0
  local f v
  for f in "$ROOT/.claude/handoff-slice.json" "$MAIN/.claude/handoff-slice.json" \
           "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/handoff-slice.json"; do
    [ -f "$f" ] || continue
    v=$(jq -r 'if type == "object" and has("shareAcrossWorktrees") then .shareAcrossWorktrees else empty end' "$f" 2>/dev/null)
    case "$v" in true) return 0 ;; false) return 1 ;; esac
  done
  return 0
}

if ! shared; then printf '%s\n' "$OWN"
elif printf '%s\n' "$FIRST" | grep -qx bare; then printf '%s\n' "$MAIN/handoffs"
elif [ -d "$MAIN" ]; then printf '%s\n' "$MAIN/.claude/handoffs"
else printf '%s\n' "$OWN"
fi
exit 0
