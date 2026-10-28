---
description: Close a local handoff slice and move it to the archive, with a closing note
argument-hint: "uuid or slug of the slice, then optionally done | abandoned | superseded and a reason"
---

Close a slice created by `/handoff-slice:create`. Closing **moves** the slice into `.claude/handoffs/archive/` with a closing note. It never deletes anything.

**Never `rm` a slice file.** The handoffs folder is usually gitignored, so git holds no copy, and a deleted slice is gone with its Dead Ends — the part most worth keeping from finished or abandoned work.

## 1. Resolve which slice

Take the first word of `$ARGUMENTS` and match it against `.claude/handoffs/*.md` (top level only) as a uuid prefix or slug substring.

- Empty: tell the user to name a slice, and suggest `/handoff-slice:list`. Stop.
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
