# Revision format

Shared conventions for revising an existing handoff. Both `/handoff-slice:update` (local file) and `/handoff-slice:issue-update` (GitHub issue body) follow this file, so a slice revised on one backend reads the same as one revised on the other. Don't improvise a format — a second dialect is worse than no update command at all.

## The one principle: mark, don't delete

A handoff's most valuable content is often a **reversal** — "we planned X, X turned out to be wrong, here's what disproved it." Overwrite the plan and you delete the warning, and the next session cheerfully re-derives the dead end.

So when something is no longer true:

- **Never** silently delete or rewrite it.
- Move it to **Dead Ends** carrying the reason it died — the measurement, the error, the closed issue, the commit sha.
- Strike through superseded table rows (`~~old value~~`) rather than removing them, with a short reason in the adjacent cell.
- Only genuinely delete content that was factually wrong when written *and* carries no lesson — a typo'd path, a wrong line number.

A slice that grows a Dead Ends section over three revisions is working correctly. A slice whose Remaining Work quietly shrank is losing information.

## Verify against reality, not just the conversation

The slice may be stale for reasons nobody in the current conversation mentioned. Before revising, check actual state:

- `git log` since the slice's `Updated` (or `Created`) date — commits land after a slice is written, and nobody who loads it knows.
- Referenced issues/PRs — closed? merged? rejected?
- **Issues and PRs the slice does _not_ reference.** Search by the topic's own keywords, open *and* closed: `gh issue list --state all --search "<keyword from the plan>"`. This is the check that catches the worst case — a plan disproven in an issue the slice never knew existed. Following only the links the slice already contains cannot find it.
- Files under **Relevant Files** — still exist at those paths?
- Any roadmap, spec, or docs the slice points at.

The most damaging staleness is the kind nobody knew about.

## Revision banner

Whoever loads this next must see "parts of this are corrected" within the first ten lines. Insert or extend a banner directly under the header block (local file) or under the resume block (issue body):

```markdown
> **Revised 2026-07-30** — parts of this slice are corrected below. Read this before the Next Steps.
> - PreCompact archive hook is dead — measurement in #41 disproved it, issue closed. Moved to Dead Ends.
> - Status was `active`, now `blocked` on the schema decision in #47.
> - Next Steps 1-2 were already done in 50a6373.
```

One line per correction, each naming what changed **and** the evidence.

**Retention.** The banner is a pointer to recent deltas, not the archive — every correction's durable record already lives in Dead Ends, Done So Far, and struck table rows. Let the banner grow to five blocks and it defeats its own purpose.

- Newest revision block goes on top.
- Keep the **newest two** blocks expanded.
- Collapse anything older into a single line beneath them: `**Also revised**: 2026-07-25, 2026-07-18`.

## Date-stamp everything new

- Set the **Updated** field in the header block to today, adding the field if the slice predates it. That isn't backfilling — you're recording a revision you just made, and the date is known truthfully. (Slices nobody has revised keep no `Updated` field; `list` shows `—` for them.)
- Mark revised content inline with `[revised 2026-07-30]`, so a reader can tell three-day-old reasoning from three-week-old.
- New items added to any section get the same inline stamp.

Without stamps a mixed-age slice reads as uniformly fresh.

**Stamp what changed, not what you checked.** Content you verified and left alone stays exactly as it was — no `[verified unchanged]` markers in the file. Verification belongs in the report you give the user (see below), where it costs nothing. Written into the slice it compounds: after five revisions every paragraph carries a trail of dates saying nothing happened, and the stamps that *do* mark real changes stop standing out.

## Order of work: highest damage per byte first

1. **Status** — an `active` slice that's actually blocked sends the next session into a wall.
2. **Next Steps** — what `load` surfaces first and acts on. A stale step 1 is the single most expensive line in the file.
3. **Snapshot** (Working/Broken) — decides whether the next session trusts the build.
4. Everything else.

## Section-by-section pass

Ask "is this still true?" of *every* section, not only the ones this conversation happened to touch:

| Section | Revision question |
|---------|-------------------|
| Objective | Has the goal shifted, or only the route to it? |
| Done So Far | Anything here since reverted or superseded? Anything finished that isn't listed? |
| Remaining Work | Any item done, dropped, or now impossible? Impossible ones move to Dead Ends with why. |
| Dead Ends | Add newly disproven approaches with their evidence. Never trim. |
| Decisions Made | Any decision reversed? Strike the row, add the new one, keep both visible. |
| Snapshot | Does Working/Broken still match a real run? |
| Relevant Files | Paths moved, renamed, deleted? A path that a **Next Step** is supposed to *create* is expected to be missing — that's not staleness, don't "correct" it. |
| Code Refs | Signatures still current? Re-read the source — don't trust the copy in the slice. |
| Next Steps | Rewrite fully. Already-done steps move to Done So Far, invalidated ones to Dead Ends, real next action first. |
| Prerequisites | New env vars, services, accounts needed? |
| Gotchas | Trap fixed (remove it), or new trap found (add it)? |
| Follow-up Skills | Still the right skills? |

Sections the slice never had aren't errors — `create` omits empty ones. Add one only if it now has real content, and stamp it as new.

Report which sections you checked and found unchanged — "verified, no change" is information; silence isn't.

## Status

`Status` drives how `load` and `list` present the slice, so the three values have to mean the same thing to every session. They are not moods:

| Value | Means | Test |
|-------|-------|------|
| `active` | Someone can pick this up right now and make progress | Next Step 1 is something the next session can just *do* — including "figure out where X happens" or "decide between A and B". An open design question you are free to settle yourself is **active**, not blocked. |
| `blocked` | Progress needs something outside this slice | Waiting on a decision that isn't yours, an unmerged PR, an unanswered question, a dependency, someone else's work. If you cannot proceed no matter how much effort you apply, it's blocked. |
| `ready-to-close` | The work is finished or abandoned; nothing actionable remains | Remaining Work is empty or entirely superseded. |

The line that gets confused: **undecided is not blocked.** A slice whose next step is "choose the capture point" is `active` — the choice is yours to make. It's `blocked` only if the choice belongs to someone else.

A revision may set `Status` to `ready-to-close`. It may **not** act on that: never delete the file, never `gh issue close`. Say the slice looks closeable and leave the act to the user.
