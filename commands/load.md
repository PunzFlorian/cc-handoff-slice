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

## 3. Check the slice isn't stale

A slice is a snapshot, not the truth. Before acting on its first **Next Step**, confirm that step hasn't already been done or been invalidated:

```
git log --oneline --since=<slice Updated or Created date>
```

Also check the state of any issue or PR that step depends on (`gh issue view`, `gh pr view`), and — the check that matters most — search for issues the slice **doesn't** reference, closed ones included:

```
gh issue list --state all --search "<keyword from the first Next Step>"
```

An approach can be disproven in an issue the slice never knew about. Following only the links already in the slice cannot find that.

If the first step looks already-done or disproven, say so instead of building it, and offer `/handoff-slice:update <uuid>` to bring the slice current before continuing. If the slice carries a revision banner, read it and honor the corrections in it over anything they supersede further down.

## 4. Confirm and continue

Ask if the user wants to continue. Once confirmed, proceed from the first item in **Next Steps**, unless they redirect. If anything critical in the slice is ambiguous, ask rather than guessing.
