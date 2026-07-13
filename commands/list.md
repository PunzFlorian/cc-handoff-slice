---
description: List handoff slices saved in this repo
---

List every slice saved under `.claude/handoffs/` in the current repo.

If the directory doesn't exist or is empty, tell the user no slices exist yet and point them at `/handoff-slice:create`.

Otherwise, for each `.md` file, read the header block (`**UUID**`, `**Topic**`, `**Created**`, `**Status**`) and print a table:

| UUID | Topic | Created | Status |
|------|-------|---------|--------|

Sort newest first. Mention the exact `/handoff-slice:load <uuid>` command the user can copy to load any of them.
