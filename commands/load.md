---
description: Load a previously sliced handoff into this session
argument-hint: "uuid or slug of the handoff to load"
---

Load a slice created by `/handoff-slice:create` into the current session.

## 1. Find the file

If `$ARGUMENTS` is empty, tell the user to run `/handoff-slice:list` to see available slices, and stop.

Otherwise look in `.claude/handoffs/` for a file whose name matches `$ARGUMENTS` as a uuid prefix or slug substring.

- No match: say so, suggest `/handoff-slice:list`.
- Multiple matches: show them (uuid + slug + topic) and ask the user to pick one.
- Exactly one match: read it fully.

## 2. Summarize, don't dump

Give the user a short summary — topic, status, and the first item under **Next Steps** — instead of printing the whole file.

Prominently surface **Dead Ends** and **Gotchas** so they aren't repeated or missed.

## 3. Confirm and continue

Ask if the user wants to continue. Once confirmed, proceed from the first item in **Next Steps**, unless they redirect. If anything critical in the slice is ambiguous, ask rather than guessing.
