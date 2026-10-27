#!/bin/bash
# Tests for scripts/context-size.sh and the hint it feeds in hooks/restart-advisor.sh.
#
#   bash tests/context-size.test.sh
#
# Each case writes a small transcript, runs the script on a hook payload that
# names it, and compares the output. Needs bash and jq, like the scripts.

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

usage() { # usage <tokens> — an assistant record whose prefix totals <tokens>
  printf '{"type":"assistant","message":{"model":"claude-opus-5-5","usage":{"input_tokens":%s,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}\n' "$1"
}
boundary() {
  printf '{"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"manual","preTokens":250000,"postTokens":12000}}\n'
}
user() {
  printf '{"type":"user","message":{"role":"user","content":"next"}}\n'
}

# transcript <name> <record>... — writes the records, one per line, and prints the path
transcript() {
  local f="$WORK/$1.jsonl"; shift
  : > "$f"
  for r in "$@"; do printf '%s\n' "$r" >> "$f"; done
  printf '%s' "$f"
}
payload() { printf '{"transcript_path":"%s","cwd":"%s","session_id":"test"}' "$1" "$WORK"; }

check() { # check <name> <expected> <actual>
  if [ "$2" = "$3" ]; then PASS=$((PASS + 1)); echo "ok   $1"
  else FAIL=$((FAIL + 1)); echo "FAIL $1"; echo "     expected: $2"; echo "     actual:   $3"; fi
}
size() { payload "$1" | bash "$ROOT/scripts/context-size.sh" --model; }

# --------------------------------------------------------------- the size
T=$(transcript plain "$(usage 1000)" "$(user)" "$(usage 250000)")
check 'the newest usage is the size' '250000 claude-opus-5-5' "$(size "$T")"

T=$(transcript compacted "$(usage 250000)" "$(boundary)" "$(user)")
check 'after a compaction, before any response, the size is unknown' '0 claude-opus-5-5' "$(size "$T")"

T=$(transcript answered "$(usage 250000)" "$(boundary)" "$(user)" "$(usage 49000)")
check 'a response after the compaction gives the size again' '49000 claude-opus-5-5' "$(size "$T")"

T=$(transcript twice "$(usage 250000)" "$(boundary)" "$(usage 49000)" "$(boundary)")
check 'the newest compaction counts, not the first' '0 claude-opus-5-5' "$(size "$T")"

T=$(transcript empty "$(user)")
check 'no usage at all is unknown' '0 unknown' "$(size "$T")"

T=$(transcript garbage 'not json' '{"type":"assistant","message":"a string"}' "$(usage 70000)" '{"truncated')
check 'unreadable and odd records are skipped' '70000 claude-opus-5-5' "$(size "$T")"

# ----------------------------------------------------- the hint it feeds
# A config dir of its own keeps the user's settings and first-run marker out.
hint() {
  payload "$1" | CLAUDE_CONFIG_DIR="$WORK/config" CLAUDE_PLUGIN_ROOT="$ROOT" TMPDIR="$WORK" HANDOFF_SLICE_HINTS= \
    bash "$ROOT/hooks/restart-advisor.sh"
}
mkdir -p "$WORK/config"
: > "$WORK/config/.handoff-slice-hints-seen"

T=$(transcript big "$(usage 250000)" "$(user)")
case "$(hint "$T")" in
  *'context is ~250k'*) check 'a large context gets a hint' yes yes ;;
  *) check 'a large context gets a hint' 'a hint at ~250k' "$(hint "$T")" ;;
esac

T=$(transcript big-compacted "$(usage 250000)" "$(boundary)" "$(user)")
check 'no hint on the first prompt after a compaction' '' "$(hint "$T")"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
