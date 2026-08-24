# cc-handoff-slice

A Claude Code plugin for handing off **just one topic** out of a long conversation — not the whole session.

Long sessions cover a lot of ground. When you want to continue only one thread of it later — in a new session, a different repo, or handed to someone else — loading the full history back in fills the context window with everything else you talked about too. This plugin lets you name a topic, extracts only what's relevant to it into a small standalone doc, and gives that doc a uuid so a fresh session can load exactly that slice on its own.

## Install

Inside Claude Code:

```
/plugin marketplace add PunzFlorian/cc-handoff-slice
/plugin install handoff-slice
```

Works in any repo after that — no per-project setup.

## Commands

| Command | What it does |
|---------|--------------|
| `/handoff-slice:create <topic>` | Extracts everything relevant to `<topic>` from the current conversation into `.claude/handoffs/<uuid>-<slug>.md` |
| `/handoff-slice:load <uuid or slug>` | Loads a saved slice into the current session and picks up from its Next Steps |
| `/handoff-slice:update [uuid or slug]` | Revises a slice that's gone stale — derives what changed from the conversation *and* from repo state |
| `/handoff-slice:list` | Shows every slice saved in this repo |
| `/handoff-slice:issue-create <topic>` | Same extraction, but files it as a self-contained GitHub issue instead of a local file — for handing off to someone else, or a machine that doesn't have your local `.claude/handoffs/` |
| `/handoff-slice:issue-load <issue number or url>` | Loads a slice previously filed as a GitHub issue |
| `/handoff-slice:issue-update <issue number or url>` | Revises an issue-backed handoff in place |

You can also just say things like "slice off this part about the auth bug" — the bundled skill routes natural phrasing to the right command.

## Keeping a slice current

A slice is a snapshot. On long-running work it outlives merges, and then it lies — its first Next Step is already done, or its plan was disproven days ago. A session that trusts the doc builds dead work.

Two things address that:

- **`load` verifies before acting.** Before working the first Next Step it checks `git log` since the slice was written, plus the state of any issue or PR that step depends on. If the step's already done or invalidated, it says so instead of building it.
- **`update` revises in place**, deriving what changed from the conversation *and* from repo state — because the most damaging staleness is the kind nobody in the room mentioned. You don't have to tell it what moved.

The rule `update` is built around: **mark, don't delete.**

> A handoff's most valuable content is often a reversal — "we planned X, X turned out to be wrong, here's the measurement that disproved it." Overwrite the plan and you delete the warning, and the next session cheerfully re-derives the dead end.

So superseded plan items move into **Dead Ends** carrying their disproof, superseded table rows get struck through rather than removed, a dated revision banner goes in the first ten lines, and new content is date-stamped so three-day-old reasoning is distinguishable from three-week-old. The full conventions live in [`skills/handoff-slice/references/revision-format.md`](skills/handoff-slice/references/revision-format.md) and are shared by both backends, so a revised local slice and a revised issue read identically.

For issues, the **body is the single source of truth** — it's edited in place and always current. Since GitHub body edits are silent, `issue-update` also posts a short dated comment pointing at the body, but only when Status, Next Steps, or Dead Ends changed. The comment never contains a copy of the handoff, so there's no second aging version to confuse anyone, and `issue-load` reads the body only.

Revisions are applied as targeted edits to the sections that changed, not as a wholesale rewrite of the
file — a mature slice is large by design, and rewriting all of it to correct three sections costs in
proportion to the slice rather than to the change. The revision banner and the `Updated` date are
written last, so a revision interrupted partway leaves a file that is visibly un-stamped instead of
silently half-written. (Issue-backed slices are the exception: the GitHub API replaces the whole body,
so there is no partial write available there.)

Neither command closes anything. If the work looks finished they'll say the slice is closeable and leave the act to you.

`issue-create`/`issue-load` require the [`gh` CLI](https://cli.github.com/) installed and authenticated against this repo. Issues get a `handoff-slice` label so they're easy to find later with `gh issue list --label handoff-slice`. The issue body is fully self-contained — no link back to anything local — and has the exact `/handoff-slice:issue-load <number>` command embedded right in the description, so anyone opening it on GitHub knows exactly how to pick it up.

## Restarting mid-session

The reason to slice isn't only that a session is ending. It's that past a certain size, continuing one costs more than starting over with just the part you still need.

Every request in a session re-reads the whole conversation so far, so cost grows with *requests × context*, and context only ever goes up. A restart resets the second term: write the topic into a slice, start fresh, load the slice. Above roughly 200k that pays for itself within about seven turns.

The catch is that the moment to do it arrives mid-work, and nothing announces it. The plugin's hook watches for it and prompts a restart when the numbers say it's worth one — silently doing nothing the rest of the time. What you'll see is an offer in two parts, and both matter: update or create the slice, then `/clear` and load it. Slicing without restarting saves nothing.

Whether enough work remains is your call — the model knows the context size, you know what's left. Decline and it won't ask again until the next threshold. See [Configuration](#configuration) for the thresholds and the off switch.

## One slice at a time

`load` takes one slice, and checks it against what you're actually doing before reading it.

A loaded slice isn't consulted and released — it sits in the session's context and is paid for on every request that follows, whether anything reads it or not. So the cost of loading a slice you don't end up needing is not zero, it's the slice's size times the length of the session. The failure that costs the most isn't loading the wrong slice; it's loading a plausible one that never gets opened.

If several slices match, `load` lists them with their sizes and asks which one the task needs. If the one you asked for is about something other than what you just described, it says so and asks before reading. Topic overlap isn't relevance — a slice can cover the right subsystem and still have nothing to say about today's problem.

## Example

```
/handoff-slice:create the rate limiter refactor
```

```
Saved: rate-limiter-refactor (a1b2c3d4-...)
File: .claude/handoffs/a1b2c3d4-e5f6-...-rate-limiter-refactor.md

Load this in a new session with:

/handoff-slice:load a1b2c3d4-e5f6-...
```

## Slice format

Each saved file is a small, self-contained doc:

```markdown
# Slice: Rate Limiter Refactor

**UUID**: a1b2c3d4-e5f6-...
**Created**: 2026-07-13
**Updated**: 2026-07-13
**Topic**: Move rate limiting from middleware into the gateway layer
**Status**: active

## Objective
...

## Done So Far
...

## Remaining Work
...

## Decisions Made
...

## Snapshot
...

## Relevant Files
...

## Next Steps
...

## Prerequisites
...

## Gotchas
...

## Follow-up Skills
...

<!-- ARCHIVE — retained, not loaded. grep this section; don't read it whole. -->

## Dead Ends
...

## Code Refs
...
```

Only sections with real content are included (except Dead Ends, which is always present — "None" if nothing failed). Secrets and credentials are redacted before writing, and content already captured elsewhere (specs, PRs, commits, issues) is referenced by path or URL instead of duplicated.

### Head and archive

The marker line splits what a session **reads** from what the slice **keeps**. `load` reads only the head above it; Dead Ends, Code Refs, and superseded rows and snippets sit below, retained in full and read only when something actually needs them.

That split exists because the two halves have opposite growth curves. The head answers *what do I do next*, and stays roughly constant — revisions replace its content. The archive answers *what was already tried and why it failed*, and only ever grows, because a revision never deletes a dead end. Load the whole file and every session pays for the entire history of the work on every request; load the head and it pays for the current state.

Retention is unchanged by this. Dead Ends is the reason a slice beats a summary — it is what stops the next session confidently re-deriving something that was already measured and rejected — so the fix for its size is to stop *loading* it by default, never to keep less of it. Aim for under ~20 KB above the marker, and reach that by moving detail below the line rather than by dropping it.

Issue-backed handoffs make the same split with a collapsed `<details>` block, since an issue has only one body. Slices written before the marker existed have none; they load whole, and `load` says so rather than letting an expensive old slice look cheap.

`issue-create` uses the same sections minus the header block and `Status` field (the issue's own title, creation date, and open/closed state already cover that), with a resume-command block inserted at the very top:

```markdown
> **Resume this handoff in Claude Code:**
> ```
> /handoff-slice:issue-load 42
> ```

## Objective
...
```

## License

MIT
