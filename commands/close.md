---
description: Close a local handoff slice and move it to the archive, or review all live slices for closing
argument-hint: "uuid or slug, then optionally done | abandoned | superseded and a reason; no arguments to review all live slices"
---

Close a slice created by `/handoff-slice:create`. Closing **moves** the slice into `.claude/handoffs/archive/` with a closing note. It never deletes anything.

**Never `rm` a slice file.** The handoffs folder is usually gitignored, so git holds no copy, and a deleted slice is gone with its Dead Ends — the part most worth keeping from finished or abandoned work.

With no `$ARGUMENTS`, review the live slices first (below). With a slice named, skip to **1. Resolve which slice**.

## Review: which live slices are finished?

Slices outlive their work. Status is rarely updated, so a slice can read `active` for weeks after its branch merged, or after a later slice took over its topic. This review finds those, and the user decides.

### a. Cheap signals, from headers only

```
git fetch --quiet origin
```

Run that once, so the comparison below isn't against a stale copy of the default branch. If it fails (offline, no remote), carry on with the local refs and say so.

For each `.claude/handoffs/*.md` (top level only), read the header block — `sed -n '1,10p'`, never the whole file — and run:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/slice-merged.sh" <file>
```

Note per slice:
- **Status** is `ready-to-close`.
- **Merged**: the script printed `merged <sha>`.
- **Untouched**: `Updated` (or `Created`) is more than two weeks old.
- **Overlap**: another live slice's Topic covers the same work. The older of the two is the candidate for `superseded`.

### b. Deep check, outside this context

Whether the Next Steps were actually done takes reading each slice's head and comparing it with git history. Real heads run to several thousand tokens each, and fifteen of them read here would be charged on every later request of this session.

So hand it to subagents, about five slices each, in parallel. Only when the heads together are small (a few slices, a few KB in all, going by file size) do it here instead. Either way, the check is:

> For each slice, read only the head — `sed -n '1,/^<!-- ARCHIVE/p' <file>` — never below the marker. Compare its Next Steps and Remaining Work with the history on **every** branch, not only the default one: `git log --all --oneline --since=<Updated or Created>`. Work that isn't merged yet still counts as done work. Where a step names something concrete, check the code too. Change nothing. Return one line per slice: `<uuid> | <done / partly done / not done / can't tell> | <evidence: sha, PR number, or file>`; for partly done, say which steps are open.

Skip the deep check for a slice the user already marked `ready-to-close`.

### c. Propose, then let the user decide

Show one table:

| Slice | Signals | Steps | Suggestion |
|---|---|---|---|
| `48a6…` restart-threshold | merged `48a69f7` · untouched 3w | 1–2 done (`48a69f7`), 3 open | close as done? |

Suggestions are `done`, `abandoned`, `superseded by <uuid>`, or `keep`. Code can't tell a step that wasn't done from one that wasn't needed, so where steps are open, show the evidence and ask rather than deciding.

A merged branch is a hint, not a verdict. A PR often covers only part of a slice, so never suggest `done` from the merge alone, without the step check agreeing.

Then close each slice the user picks with the steps below, one at a time, using the outcome they chose. Leave every slice they don't pick untouched. Report what was closed, and how many live slices remain.

## 1. Resolve which slice

Take the first word of `$ARGUMENTS` and match it against `.claude/handoffs/*.md` (top level only) as a uuid prefix or slug substring.

- No match: say so. If it matches a file in `archive/`, say that slice is already closed.
- Multiple matches: show them (uuid + slug + topic) and ask which one.

Read the resolved file fully before changing anything.

## 2. Settle the outcome

The second word of `$ARGUMENTS` is the outcome, and anything after it the reason:

- `done` — the work is finished.
- `abandoned` — it won't be finished: not needed any more, or the approach was dropped.
- `superseded` — another slice carries the work on. The reason names its uuid.

If no outcome was given and the user's own words don't settle it ("we finished it" is `done`, "we dropped it" is `abandoned`), ask in one question, with the reason optional. Don't guess from the slice's contents. Say which outcome you took, so a wrong reading is easy to correct.

List the **Next Steps** and **Remaining Work** items still open in the slice, and ask whether any of them should carry on somewhere (an existing slice, a new one, an issue). Keep them in the file either way: an open step that wasn't needed is information, not clutter.

## 3. Write the closing note

Follow `references/revision-format.md` from inside this plugin's own directory, as `update` does. If a direct read fails, locate it:

```
find "$HOME/.claude/plugins" -path '*handoff-slice*/references/revision-format.md' 2>/dev/null | sort | tail -1
```

Then, with targeted `Edit`s:

1. Set `**Status**: closed: <outcome> — <reason>`.
2. Add `**Closed**: <today>` to the header block, below `**Updated**`.
3. Add a banner block on top, per the banner rules:

   ```markdown
   > **Closed 2026-10-28** — done. Kept for reference; not live work.
   > - Next Step 3 left open (not needed).
   ```

   One line per open item, saying what became of it.

Don't move content into Dead Ends or rewrite sections: a close records the outcome, it isn't a revision. If the slice is also out of date, offer `/handoff-slice:update` first.

## 4. Move it

```
mkdir -p .claude/handoffs/archive && mv .claude/handoffs/<file> .claude/handoffs/archive/
```

Run this from the project root, the directory that contains `.claude/handoffs/`.

## 5. Report

Tell the user:
- Which slice was closed (uuid + slug), the outcome, and its new path.
- What was recorded about the open items.
- How to reopen it: move the file back out of `archive/` and set its Status again.

`load` still finds archived slices, so it stays loadable by uuid.
