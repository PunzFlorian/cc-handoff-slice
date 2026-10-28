#!/bin/bash
# Tests for scripts/slice-merged.sh.
#
#   bash tests/slice-merged.test.sh
#
# Builds one throwaway repo with dated commits and an origin/main ref, writes
# slices that name its branches, and compares the script's verdict. Needs bash
# and git, like the script.

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); echo "ok   $1"
  else FAIL=$((FAIL + 1)); echo "FAIL $1"; echo "     expected: $2"; echo "     actual:   $3"; fi
}

# A repo of its own, so neither the user's git config nor this repo leaks in.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
REPO="$WORK/repo"
git init -q -b main "$REPO"
cd "$REPO" || exit 1
git config user.email t@t
git config user.name t

commit() { # commit <date> <message> — an empty commit at that date
  GIT_AUTHOR_DATE="$1T12:00:00" GIT_COMMITTER_DATE="$1T12:00:00" git commit -q --allow-empty -m "$2"
}
merge() { # merge <date> <branch> — a real merge commit into the current branch
  GIT_AUTHOR_DATE="$1T12:00:00" GIT_COMMITTER_DATE="$1T12:00:00" git merge -q --no-ff --no-edit "$2"
}
publish() { # mirror main to origin/main, as a fetch would
  git update-ref refs/remotes/origin/main main
  git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main
}
# slice <branch> <created> — a slice header naming the branch; prints its path
slice() {
  local f="$WORK/slice-$RANDOM.md"
  printf '# Slice: t\n\n**UUID**: x\n**Created**: %s\n**Branch**: `%s`\n**Status**: active\n' "$2" "$1" > "$f"
  printf '%s' "$f"
}
verdict() { bash "$ROOT/scripts/slice-merged.sh" "$1" | cut -d' ' -f1; }

commit 2026-09-01 init

# merged: work on a branch, slice cut mid-work, branch merged later
git checkout -q -b feat/merged; commit 2026-09-02 a1
git checkout -q main; commit 2026-09-03 m1; merge 2026-09-10 feat/merged

# open: work that never reached main
git checkout -q -b feat/open; commit 2026-09-11 o1; git checkout -q main

# fresh: cut the same day as the slice, nothing on it yet
git branch feat/fresh

# indirect: feat/inner merged into feat/outer, which then merged into main
git checkout -q -b feat/outer; commit 2026-09-12 out1
git checkout -q -b feat/inner; commit 2026-09-12 in1
git checkout -q feat/outer; merge 2026-09-13 feat/inner
git checkout -q main; merge 2026-09-14 feat/outer

# squashed: the branch's change lands as a new commit, its own stays off main
git checkout -q -b feat/squashed; commit 2026-09-15 sq1
git checkout -q main; commit 2026-09-16 "squash of feat/squashed"

# behind: the pushed copy has a commit the local, merged-looking one lacks
git checkout -q -b feat/behind; commit 2026-09-17 b1
git checkout -q main; merge 2026-09-18 feat/behind
git update-ref refs/remotes/origin/feat/behind feat/behind
git checkout -q --detach refs/remotes/origin/feat/behind; commit 2026-09-19 b2
git update-ref refs/remotes/origin/feat/behind HEAD
git checkout -q main

publish

check 'a branch merged after the slice was cut' merged "$(verdict "$(slice feat/merged 2026-09-02)")"
check 'a branch with work not on main'          open   "$(verdict "$(slice feat/open 2026-09-11)")"
check 'a fresh branch with nothing on it'       unknown "$(verdict "$(slice feat/fresh 2026-09-18)")"
check 'a branch merged through another branch'  merged "$(verdict "$(slice feat/inner 2026-09-12)")"
check 'a squash merge reads as open (known miss)' open "$(verdict "$(slice feat/squashed 2026-09-15)")"
check 'a pushed commit not on main keeps it open' open "$(verdict "$(slice feat/behind 2026-09-17)")"
check 'a branch that no longer exists'          unknown "$(verdict "$(slice feat/gone 2026-09-02)")"
check 'a slice cut on the default branch'       unknown "$(verdict "$(slice main 2026-09-02)")"

NOBRANCH="$WORK/nobranch.md"
printf '# Slice: t\n\n**Created**: 2026-09-02\n**Status**: active\n' > "$NOBRANCH"
check 'a slice without a Branch field'          unknown "$(verdict "$NOBRANCH")"

# Without origin, the local default branch stands in.
git symbolic-ref -d refs/remotes/origin/HEAD
git update-ref -d refs/remotes/origin/main
check 'no origin: falls back to local main'     merged "$(verdict "$(slice feat/merged 2026-09-02)")"

cd "$WORK" || exit 1
check 'outside a git repo'                      unknown "$(verdict "$(slice feat/merged 2026-09-02)")"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
