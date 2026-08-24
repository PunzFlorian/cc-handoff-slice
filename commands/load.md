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
- Exactly one match: read its **head** (see below).

## 1b. Read the head, not the archive

Slices carry an archive marker separating the part a session needs from the part it retains:

```
<!-- ARCHIVE — retained, not loaded. grep this section; don't read it whole. -->
```

Read only up to it:

```
sed -n '1,/^<!-- ARCHIVE/p' <file>
```

Everything below the marker — Dead Ends, Code Refs, superseded rows and snippets — stays on disk unread. It is the part that grows with every revision, and loading it means paying for the whole archive on every request of the session when only the head decides what to do next.

**Slices written before the marker existed have none**, and the command above then returns the whole file. That is the correct fallback, but say so out loud: *"no archive marker — loaded the whole file (N KB)."* Otherwise an old slice looks as cheap as a split one while costing several times more, and nobody knows to run `/handoff-slice:update` to split it.

## 2. Summarize, don't dump

Give the user a short summary — topic, status, and the first item under **Next Steps** — instead of printing the whole file.

Surface **Gotchas** prominently; they're in the head precisely because they matter before work starts.

For the archive, surface a **pointer, not the content**: say it exists, how big it is, and how to reach it —

```
grep -n '<term>' <file>
```

Read below the marker only when a Next Step actually touches something it covers — an approach that may already be a dead end, a signature you're about to call. That's a deliberate, targeted read, not part of loading.

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
