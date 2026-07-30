---
description: List handoff slices saved in this repo
---

List every slice saved under `.claude/handoffs/` in the current repo.

If the directory doesn't exist or is empty, tell the user no slices exist yet and point them at `/handoff-slice:create`.

Otherwise, for each `.md` file, read the header block (`**UUID**`, `**Topic**`, `**Created**`, `**Updated**`, `**Status**`) and print a table:

| UUID | Topic | Created | Updated | Status |
|------|-------|---------|---------|--------|

`Updated` is what shows rot: `Status` is freeform, so a slice can read `active` while sitting untouched for weeks. Slices written before that field existed have no `Updated` — print `—` rather than guessing, and don't backfill it.

Sort newest first by `Updated`, falling back to `Created` where it's missing. Flag any slice as possibly stale when that same date — `Updated`, or `Created` when there's no `Updated` — is more than two weeks old, and mention `/handoff-slice:update <uuid>` for those. Say *why* it's flagged: a slice reading `active` while untouched for a month is the case worth catching, since `Status` alone ranks it as live work.

Mention the exact `/handoff-slice:load <uuid>` command the user can copy to load any of them.
