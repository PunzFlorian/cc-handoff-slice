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

## 3. Confirm and continue

Ask if the user wants to continue. Once confirmed, proceed from the first item in **Next Steps**, unless they redirect. If anything critical is ambiguous, ask rather than guessing.
