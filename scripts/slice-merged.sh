#!/bin/bash
# Has a slice's branch been merged into the default branch?
#
#   bash slice-merged.sh <slice-file>
#
# Run from inside the repo. Prints one line:
#   merged <sha>  the branch's work is on the default branch (sha: branch tip)
#   open          the branch has commits of its own that aren't there yet
#   unknown       no signal: no Branch field, branch gone, no default branch,
#                 or the branch had no work of its own after the slice was cut
#
# Callers must treat "unknown" as no signal, never as "not merged", and treat
# "merged" as a hint to check the Next Steps, never as proof they're done.
#
# Plain git, so it works the same on GitHub, Azure DevOps and GitLab. It
# relies on merge commits keeping the branch tip reachable; a squash merge
# rewrites the commits, so a squashed branch reads as "open". It compares
# against origin/<default> as it is locally, without fetching.
#
# The Created date is what keeps a freshly cut branch from reading as merged:
# a branch counts only if it carries commits that weren't on the default
# branch by the end of that day. Without that, a branch with no commits yet
# points at a commit already on main and would read as merged.

set -o pipefail

FILE=${1:-}
[ -f "$FILE" ] || { echo unknown; exit 0; }

# field <name> — the header value, without backticks or surrounding spaces.
field() { sed -n "s/^\*\*$1\*\*:[[:space:]]*//p" "$FILE" | head -1 | tr -d '`' | sed 's/[[:space:]]*$//'; }

BRANCH=$(field Branch)
CREATED=$(field Created)
[ -n "$BRANCH" ] || { echo unknown; exit 0; }
[[ $CREATED =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo unknown; exit 0; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo unknown; exit 0; }

# The default branch: origin/HEAD when set, else the usual names.
DEFAULT=$(git symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null)
if [ -z "$DEFAULT" ]; then
  for ref in origin/main origin/master main master; do
    git rev-parse -q --verify "$ref^{commit}" >/dev/null && { DEFAULT=$ref; break; }
  done
fi
[ -n "$DEFAULT" ] || { echo unknown; exit 0; }
[ "$BRANCH" = "${DEFAULT#origin/}" ] && { echo unknown; exit 0; }

# Every copy of the branch that exists must be merged: a local branch that's
# behind its pushed copy would otherwise read as merged while the pushed
# commits aren't.
TIPS=()
for ref in "refs/heads/$BRANCH" "refs/remotes/origin/$BRANCH"; do
  sha=$(git rev-parse -q --verify "$ref^{commit}" 2>/dev/null) && TIPS+=("$sha")
done
[ ${#TIPS[@]} -gt 0 ] || { echo unknown; exit 0; }

# The default branch as it stood at the end of the Created day.
BASE=$(git rev-list -1 --first-parent --before="$CREATED 23:59:59" "$DEFAULT" 2>/dev/null)

for tip in "${TIPS[@]}"; do
  OWN=$(git rev-list --count "$tip" ${BASE:+"^$BASE"} 2>/dev/null) || { echo unknown; exit 0; }
  [ "$OWN" -gt 0 ] || { echo unknown; exit 0; }
  git merge-base --is-ancestor "$tip" "$DEFAULT" 2>/dev/null || { echo open; exit 0; }
done

echo "merged $(git rev-parse --short "${TIPS[0]}")"
