#!/bin/bash
# Print the current session's context size in tokens, as a bare integer.
#
# Prints 0 when the size can't be determined. Callers must treat 0 as
# "unknown" and act as if they had never asked — never as "small".
#
# Reads Claude Code's hook/statusline JSON payload on stdin when there is one
# (that carries transcript_path directly). With no payload it falls back to
# locating the transcript under the working directory's project dir, which is
# what happens when the model runs this by hand mid-session.
#
# The number is the newest request's full prefix: cache reads + cache writes +
# fresh input from the last usage block. No de-duplication is needed for that —
# duplicate records per streamed block only distort sums *across* turns, and
# this reads a single record.

set -o pipefail

PAYLOAD=""
# Only read stdin if something is actually piped in; a bare invocation from a
# terminal would otherwise block here forever.
if [ ! -t 0 ]; then PAYLOAD=$(cat 2>/dev/null); fi

command -v jq >/dev/null 2>&1 || { printf '0'; exit 0; }

TRANSCRIPT=""
CWD=""
SID=""
if [ -n "$PAYLOAD" ]; then
  TRANSCRIPT=$(printf '%s' "$PAYLOAD" | jq -r '.transcript_path // empty' 2>/dev/null)
  CWD=$(printf '%s' "$PAYLOAD" | jq -r '.cwd // .workspace.project_dir // empty' 2>/dev/null)
  SID=$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'a-zA-Z0-9-' | head -c 64)
  # A payload that names a transcript is authoritative. On the first prompt of
  # a session that file does not exist on disk yet, and the honest answer is
  # "unknown" — never some other session's transcript, whose size has nothing
  # to do with this one.
  if [ -n "$TRANSCRIPT" ] && [ ! -f "$TRANSCRIPT" ]; then printf '0'; exit 0; fi
fi
[ -n "$CWD" ] || CWD="$PWD"

if [ -z "$TRANSCRIPT" ]; then
  # Claude Code stores transcripts under a directory named after the absolute
  # project path with every "/" and "." replaced by "-", one <session-id>.jsonl
  # per session.
  SLUG=$(printf '%s' "$CWD" | tr '/.' '--')
  DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/$SLUG"
  if [ -n "$SID" ] && [ -f "$DIR/$SID.jsonl" ]; then
    TRANSCRIPT="$DIR/$SID.jsonl"
  elif [ -d "$DIR" ]; then
    # Last resort, when nothing identified the session. mtime is not a reliable
    # proxy for "current" — indexers and resumes touch old transcripts — so this
    # runs only when there is no session id and no transcript path to go on.
    TRANSCRIPT=$(ls -t "$DIR"/*.jsonl 2>/dev/null | head -1)
  fi
fi

[ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ] || { printf '0'; exit 0; }

# Bounded tail: transcripts reach megabytes, and every assistant record carries
# a usage block, so the newest one is always within a few lines of the end.
CTX=$(tail -n 80 "$TRANSCRIPT" 2>/dev/null \
  | jq -Rn '[inputs | fromjson? | .message?.usage? | select(. != null)]
            | if length == 0 then 0
              else (last | (.cache_read_input_tokens // 0)
                         + (.cache_creation_input_tokens // 0)
                         + (.input_tokens // 0))
              end' 2>/dev/null)

case "$CTX" in ''|*[!0-9]*) CTX=0 ;; esac
printf '%s' "$CTX"
exit 0
