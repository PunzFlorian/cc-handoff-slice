---
description: List handoff slices saved in this repo
argument-hint: "--all to include closed slices from the archive"
---

List the live slices saved under `.claude/handoffs/` in the current repo: the `.md` files at the top level. Closed slices live in `.claude/handoffs/archive/` and are left out, unless `$ARGUMENTS` is `--all`.

If there are no live slices, tell the user so and point them at `/handoff-slice:create`. If the archive has slices, mention how many and that `--all` shows them.

Otherwise, for each `.md` file, read the header block (`**UUID**`, `**Topic**`, `**Created**`, `**Updated**`, `**Status**`) and print a table:

| UUID | Topic | Created | Updated | Status |
|------|-------|---------|---------|--------|

`Updated` is what shows rot: `Status` is freeform, so a slice can read `active` while sitting untouched for weeks. Slices written before that field existed have no `Updated` — print `—` rather than guessing, and don't backfill it.

Sort newest first by `Updated`, falling back to `Created` where it's missing. Flag any slice as possibly stale when that same date — `Updated`, or `Created` when there's no `Updated` — is more than two weeks old, and mention `/handoff-slice:update <uuid>` for those. Say *why* it's flagged: a slice reading `active` while untouched for a month is the case worth catching, since `Status` alone ranks it as live work.

Slices reading `ready-to-close` have nothing left to do: mention `/handoff-slice:close <uuid>` for them.

With `--all`, print the archived slices in a second table below the live ones, with a `Closed` column in place of `Updated`, and don't flag them as stale: they're closed, not forgotten.

Mention the exact `/handoff-slice:load <uuid>` command the user can copy to load any of them.
