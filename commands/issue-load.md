---
description: Load a handoff that was filed as a GitHub issue via /handoff-slice:issue-create
argument-hint: "issue number or URL to load"
---

Load a slice that was published as a GitHub issue by `/handoff-slice:issue-create` into the current session.

## 1. Find the issue

If `$ARGUMENTS` is empty, tell the user to supply an issue number or URL — optionally suggest `gh issue list --label handoff-slice` to find one — and stop.

Otherwise run:

```
gh issue view $ARGUMENTS --json title,body,state,url
```

This works whether `$ARGUMENTS` is a bare number or a full issue URL.

## 2. Summarize, don't dump

Give the user a short summary — title, open/closed state, and the first item under **Next Steps** — instead of printing the whole issue body.

Prominently surface **Dead Ends** and **Gotchas** so they aren't repeated or missed.

Read the **body only** — comments on a handoff issue are revision notifications, not content, and the body is always the current version.

## 3. Check the issue isn't stale

A handoff issue is a snapshot, not the truth. Before acting on its first **Next Step**, confirm that step hasn't already been done or been invalidated:

```
git log --oneline --since=<issue updatedAt>
```

Also check the state of any issue or PR that step depends on, and — the check that matters most — search for issues this one **doesn't** reference, closed ones included:

```
gh issue list --state all --search "<keyword from the first Next Step>"
```

An approach can be disproven in an issue the handoff never knew about. Following only the links already in the body cannot find that.

If the first step looks already-done or disproven, say so instead of building it, and offer `/handoff-slice:issue-update <number>` to bring the issue current before continuing. If the body carries a revision banner, read it and honor its corrections over anything they supersede further down.

## 4. Confirm and continue

Ask if the user wants to continue. Once confirmed, proceed from the first item in **Next Steps**, unless they redirect. If anything critical is ambiguous, ask rather than guessing.
