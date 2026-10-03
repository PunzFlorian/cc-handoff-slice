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

# cfg <jq-path> <default> — project config wins over user config wins over
# default. The path may use $m, bound to the session's model id, so a
# per-model key can be looked up without splicing the id into jq source.
cfg() {
  local f v
  for f in "$CONF_PROJ" "$CONF_USER"; do
    [ -f "$f" ] || continue
    v=$(jq -r --arg m "${MODEL:-}" "$1 // empty" "$f" 2>/dev/null)
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

ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}"
SIZER="$ROOT/scripts/context-size.sh"
[ -f "$SIZER" ] || exit 0

read -r CTX MODEL <<EOF_SIZE
$(printf '%s' "$PAYLOAD" | bash "$SIZER" --model 2>/dev/null)
EOF_SIZE
CTX=$(num "$CTX" 0)
MODEL="${MODEL:-unknown}"

# Thresholds come from a break-even model (README). They differ per model
# because the price ratio between cache reads and writing a slice differs, and
# so does a fresh session's starting context. Opus 5.5 reads cache at half the
# old ratio and starts ~20k lighter; the two partly cancel, and its tiers land
# higher. The turn counts are what the hint tells the model; a notice of 0
# switches that tier off.
# hooks/register.tsx (tiersFor, paybackFor) draws the band from the same
# numbers: change both together.
case "$MODEL" in
  claude-opus-5-5*)
    D_FLOOR=38000;  D_NOTICE=200000; D_OFFER=300000; D_URGENT=500000
    P_NOTICE=10;    P_OFFER=7;       P_URGENT=5 ;;
  *)
    D_FLOOR=57000;  D_NOTICE=100000; D_OFFER=200000; D_URGENT=300000
    P_NOTICE=20;    P_OFFER=7;       P_URGENT=4 ;;
esac

# Per file, a key for this model beats the flat key that covers every model.
FLOOR=$(num "$(cfg '.models[$m].floor // .floor' "$D_FLOOR")" "$D_FLOOR")
T_NOTICE=$(num "$(cfg '.models[$m].tiers.notice // .tiers.notice' "$D_NOTICE")" "$D_NOTICE")
T_OFFER=$(num "$(cfg '.models[$m].tiers.offer // .tiers.offer' "$D_OFFER")" "$D_OFFER")
T_URGENT=$(num "$(cfg '.models[$m].tiers.urgent // .tiers.urgent' "$D_URGENT")" "$D_URGENT")

# 0 means the size could not be read. Unknown is not small — say nothing.
[ "$CTX" -gt 0 ] || exit 0
[ "$CTX" -ge "$FLOOR" ] || exit 0

# at <threshold> — reached, and not switched off with 0.
at() { [ "$1" -gt 0 ] && [ "$CTX" -ge "$1" ]; }

if   at "$T_URGENT"; then TIER=3
elif at "$T_OFFER";  then TIER=2
elif at "$T_NOTICE"; then TIER=1
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
  1) MSG="handoff-slice: context is ~${CTX_K}k. Slicing out a handoff and restarting in a fresh session pays for itself only if more than ~${P_NOTICE} turns of work remain here. Mention it if that's the case; otherwise say nothing." ;;
  2) MSG="handoff-slice: context is ~${CTX_K}k. Slicing out a handoff and restarting pays for itself after ~${P_OFFER} further turns, and recall over a long context degrades as it grows. Offer it: update or create the slice, then /clear and load it. Both halves, or it saves nothing." ;;
  3) MSG="handoff-slice: context is ~${CTX_K}k. Slicing out a handoff and restarting pays for itself after ~${P_URGENT} further turns; every further turn here is charged against the full prefix, and recall at this length is past where it holds up. Offer it now: update or create the slice, then /clear and load it. Both halves, or it saves nothing." ;;
esac

SEEN="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.handoff-slice-hints-seen"
if [ ! -f "$SEEN" ]; then
  MSG="$MSG (First time you've seen this: tell the user these hints can be turned off with /handoff-slice:hints off.)"
  : > "$SEEN" 2>/dev/null
fi

printf '%s\n' "$MSG"
exit 0
