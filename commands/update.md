---
description: Revise an existing local handoff slice that has gone stale, without losing what it got wrong
argument-hint: "uuid or slug of the slice to update (optional — defaults to the one used in this session)"
---

Revise a slice created by `/handoff-slice:create` so it reflects current reality. Use this when the slice still describes the work but parts of it are now wrong — a plan was disproven, steps got done elsewhere, status changed.

The user shouldn't have to tell you what changed. Derive it from this conversation and from repo state.

## 1. Resolve which slice

In this order:

1. `$ARGUMENTS`, matched against `.claude/handoffs/` as a uuid prefix or slug substring.
2. If empty — the slice loaded or updated earlier in **this session**.
3. If neither, list what's in `.claude/handoffs/` (uuid + slug + topic) and ask which one. Do **not** auto-pick the most recent.

Multiple matches on `$ARGUMENTS`: show them and ask. No match: say so, suggest `/handoff-slice:list`.

Read the resolved file fully before changing anything.

## 2. Read the revision conventions

Read `references/revision-format.md` **from inside this plugin's own directory** and follow it. It defines the mark-don't-delete rule, the banner format and its retention, the date stamps, and the per-section revision questions. Don't invent your own format.

That path is relative to the plugin, not to the repo you're working in — which is almost never the same place. If a direct read fails, locate it:

```
find "$HOME/.claude/plugins" -path '*handoff-slice*/references/revision-format.md' 2>/dev/null | sort | tail -1
```

If it genuinely can't be found, say so rather than silently improvising a format, and fall back to these four rules — the irreducible core, not a substitute for the file:

1. **Mark, don't delete.** Superseded content moves to Dead Ends carrying its disproof; superseded table rows get struck through, not removed.
2. **Verify against repo reality**, not just the conversation.
3. **Dated revision banner** in the first ten lines, one line per correction plus its evidence.
4. **Date-stamp** new and changed content inline; fix Status and Next Steps before anything else.

The rule that matters most: **superseded content is moved to Dead Ends with its disproof, never overwritten.** A reversal is the most valuable thing a handoff can carry.

## 3. Gather what actually changed

Two independent sources — use both, they catch different things:

**This conversation.** Everything discussed about this slice's topic since it was written: work completed, approaches disproven, decisions reversed, new traps found.

**Repo reality**, which the conversation may never have mentioned:

```
git log --oneline --since=<slice Updated or Created date>
```

Plus: state of every issue/PR the slice references (`gh issue view`, `gh pr view`), existence of each path under **Relevant Files**, and current signatures for anything under **Code Refs** — re-read the source rather than trusting the copy in the slice.

And the check that catches the worst case — issues the slice **doesn't** reference, closed included:

```
gh issue list --state all --search "<keyword from the plan>"
```

A plan is often disproven in an issue the slice never knew existed. Reference-following can't reach it.

If both sources come up empty, tell the user the slice still looks accurate and stop. Don't manufacture a revision.

## 4. Rewrite the file

Apply the section-by-section pass from the conventions file, in the priority order it gives — Status, then Next Steps, then Snapshot, then everything else.

Also:
- Set `**Updated**: <today>` in the header block. If the field isn't there, add it.
- Insert the dated revision banner directly under the header block, following the retention rule (newest two blocks expanded, older dates collapsed to one line).
- Redact secrets in anything newly added, same as `create`.

Write the whole file back with `Write` — don't leave it half-edited.

## 5. Report

Tell the user:
- Which slice was revised (uuid + slug + path).
- Each correction, one line each — same content as the banner.
- Sections checked and found unchanged.
- If `Status` is now `ready-to-close`, say the slice looks closeable — but don't delete it.

End with the load command, unchanged uuid:

```
/handoff-slice:load <uuid>
```
