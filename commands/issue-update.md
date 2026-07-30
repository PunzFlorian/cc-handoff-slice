---
description: Revise a handoff filed as a GitHub issue so it reflects current reality
argument-hint: "issue number or URL to update"
---

Revise the body of a handoff issue created by `/handoff-slice:issue-create`. Use this when the issue still describes the work but parts of it are now wrong.

**The issue body is the single source of truth.** It gets revised in place and always reads as current. Comments are notifications, never copies of content — see step 6.

## 1. Resolve the issue

In this order:

1. `$ARGUMENTS` (bare number or full URL).
2. If empty — the handoff issue loaded or updated earlier in **this session**.
3. If neither, ask. `gh issue list --label handoff-slice` lists candidates.

Check `gh auth status` first. If it fails, say plainly that `gh` isn't installed or authenticated and stop.

Then read the current body and its history:

```
gh issue view <number> --json title,body,state,url,updatedAt,comments
```

## 2. Read the revision conventions

Read `skills/handoff-slice/references/revision-format.md` and follow it — mark-don't-delete, banner format and retention, date stamps, per-section questions. Same conventions as the local `/handoff-slice:update`, so both backends read identically.

The rule that matters most: **superseded content moves to Dead Ends with its disproof, never overwritten.**

## 3. Gather what actually changed

**This conversation** — work done, approaches disproven, decisions reversed, traps found since the issue was written.

**Repo reality**, which nobody in this conversation may know about:

```
git log --oneline --since=<issue updatedAt>
```

Plus state of referenced issues/PRs, existence of paths under **Relevant Files**, and current signatures for **Code Refs** — re-read the source.

And the check that catches the worst case — issues this one **doesn't** reference, closed included:

```
gh issue list --state all --search "<keyword from the plan>"
```

A plan is often disproven in a sibling issue the handoff never linked. Reference-following can't reach it.

If both come up empty, say the issue still looks accurate and stop.

## 4. Rewrite the body

Section-by-section pass in priority order — Status equivalent, then Next Steps, then Snapshot, then the rest. Issue bodies have no header block and no `Status` field (the issue's own open/closed state carries it), so:

- Put the dated revision banner immediately **after** the `> **Resume this handoff in Claude Code:**` block and before `## Objective`.
- Apply the banner retention rule: newest two blocks expanded, older dates collapsed to one line.
- Inline `[revised <today>]` stamps on new and changed content.
- Redact secrets in anything newly added.

If the work now looks finished, say so in the banner (`Looks ready to close`) — but **do not run `gh issue close`**. That's the user's call.

## 5. Write it back

Write the full new body to a temp file, then:

```
gh issue edit <number> --body-file <tmpfile>
```

Clean up temp files when done.

## 6. Post a notification comment — conditionally

GitHub body edits are silent: anyone subscribed to the issue gets no signal. A comment fixes that. But a comment that duplicates the body creates a second, aging copy of the handoff — exactly the stale-data problem this command exists to fix.

So the comment is a **pointer, never content**:

```markdown
**Revised <today>** — issue body updated, read it there.
- Next Steps 1-2 already done in 50a6373
- PreCompact hook approach disproven (#41), moved to Dead Ends
```

Post it **only if `Status`, `Next Steps`, or `Dead Ends` changed** — the three that change what someone picking this up would actually do. Skip the comment for typo fixes, path corrections, and refreshed code signatures.

```
gh issue comment <number> --body "<short pointer>"
```

`/handoff-slice:issue-load` reads the body only and ignores comments, so nothing here can go stale against it.

## 7. Report

Tell the user the issue number/URL, each correction one line each, which sections were verified unchanged, and whether a comment was posted (and if not, why not). End with:

```
/handoff-slice:issue-load <number>
```
