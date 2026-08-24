#!/bin/bash
# UserPromptSubmit hook: tells the model how large the session's context has
# grown, but only once that number means something.
#
# The model cannot see its own context size, so without this the mid-session
# restart the plugin exists to trigger simply never gets offered. A statusline
# does not solve it — that renders to the terminal and never reaches the model.
#
# Silence is the default. Below the floor this prints nothing at all, so short
# sessions pay nothing and nobody learns to tune the message out.
#
# Never fail loudly: this runs on every prompt, and stdout lands in the model's
# context. Every stage degrades to printing nothing.

set -o pipefail

# Fast path: env-var off exits before spawning anything.
case "${HANDOFF_SLICE_HINTS:-}" in off|false|0|no) exit 0 ;; esac

PAYLOAD=""
if [ ! -t 0 ]; then PAYLOAD=$(cat 2>/dev/null); fi

command -v jq >/dev/null 2>&1 || exit 0

CWD=$(printf '%s' "$PAYLOAD" | jq -r '.cwd // .workspace.project_dir // empty' 2>/dev/null)
[ -n "$CWD" ] || CWD="$PWD"

CONF_USER="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/handoff-slice.json"
CONF_PROJ="$CWD/.claude/handoff-slice.json"

# cfg <jq-path> <default> — project config wins over user config wins over default.
cfg() {
  local f v
  for f in "$CONF_PROJ" "$CONF_USER"; do
    [ -f "$f" ] || continue
    v=$(jq -r "$1 // empty" "$f" 2>/dev/null)
    [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  done
  printf '%s' "$2"
}

# A malformed value must never surface as an error or as a wild threshold —
# it falls back to the measured default and stays quiet about it.
num() { case "$1" in ''|*[!0-9]*) printf '%s' "$2" ;; *) printf '%s' "$1" ;; esac; }

HINTS="${HANDOFF_SLICE_HINTS:-$(cfg '.hints' on)}"
case "$HINTS" in off|false|0|no) exit 0 ;; esac
case "$HINTS" in on|quiet) ;; *) HINTS=on ;; esac

# Thresholds come from a measured break-even model and are stated in the README.
# They are configurable because the constants behind them are specific to one
# model's token pricing; a model with cheaper output moves the floor.
FLOOR=$(num "$(cfg '.floor' 57000)" 57000)
T_NOTICE=$(num "$(cfg '.tiers.notice' 100000)" 100000)
T_OFFER=$(num "$(cfg '.tiers.offer' 200000)" 200000)
T_URGENT=$(num "$(cfg '.tiers.urgent' 300000)" 300000)

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}"
SIZER="$ROOT/scripts/context-size.sh"
[ -f "$SIZER" ] || exit 0

CTX=$(printf '%s' "$PAYLOAD" | bash "$SIZER" 2>/dev/null)
CTX=$(num "$CTX" 0)

# 0 means the size could not be read. Unknown is not small — say nothing.
[ "$CTX" -gt 0 ] || exit 0
[ "$CTX" -ge "$FLOOR" ] || exit 0

if   [ "$CTX" -ge "$T_URGENT" ]; then TIER=3
elif [ "$CTX" -ge "$T_OFFER"  ]; then TIER=2
elif [ "$CTX" -ge "$T_NOTICE" ]; then TIER=1
else TIER=0
fi
[ "$TIER" -gt 0 ] || exit 0
[ "$HINTS" = quiet ] && [ "$TIER" -lt 3 ] && exit 0

# Declining once must not mean being asked again on the next prompt. The model
# records the tier that was declined; this stays silent until the next tier up.
SID=$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'a-zA-Z0-9-' | head -c 64)
if [ -n "$SID" ]; then
  DECLINED_FILE="${TMPDIR:-/tmp}/handoff-slice-$SID.declined-tier"
  if [ -f "$DECLINED_FILE" ]; then
    DECLINED=$(num "$(head -c 8 "$DECLINED_FILE" 2>/dev/null | tr -cd '0-9')" 0)
    [ "$TIER" -le "$DECLINED" ] && exit 0
  fi
fi

CTX_K=$(( CTX / 1000 ))

case "$TIER" in
  1) MSG="handoff-slice: context is ~${CTX_K}k. Slicing out a handoff and restarting in a fresh session pays for itself only if more than ~20 turns of work remain here. Mention it if that's the case; otherwise say nothing." ;;
  2) MSG="handoff-slice: context is ~${CTX_K}k. Slicing out a handoff and restarting pays for itself after ~7 further turns. Offer it: update or create the slice, then /clear and load it. Both halves, or it saves nothing." ;;
  3) MSG="handoff-slice: context is ~${CTX_K}k. Slicing out a handoff and restarting pays for itself after ~4 further turns, and every further turn here is charged against the full prefix. Offer it now: update or create the slice, then /clear and load it. Both halves, or it saves nothing." ;;
esac

SEEN="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.handoff-slice-hints-seen"
if [ ! -f "$SEEN" ]; then
  MSG="$MSG (First time you've seen this: tell the user these hints can be turned off with /handoff-slice:hints off.)"
  : > "$SEEN" 2>/dev/null
fi

printf '%s\n' "$MSG"
exit 0
