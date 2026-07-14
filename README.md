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
| `/handoff-slice:list` | Shows every slice saved in this repo |
| `/handoff-slice:issue-create <topic>` | Same extraction, but files it as a self-contained GitHub issue instead of a local file — for handing off to someone else, or a machine that doesn't have your local `.claude/handoffs/` |
| `/handoff-slice:issue-load <issue number or url>` | Loads a slice previously filed as a GitHub issue |

You can also just say things like "slice off this part about the auth bug" — the bundled skill routes natural phrasing to the right command.

`issue-create`/`issue-load` require the [`gh` CLI](https://cli.github.com/) installed and authenticated against this repo. Issues get a `handoff-slice` label so they're easy to find later with `gh issue list --label handoff-slice`. The issue body is fully self-contained — no link back to anything local — and has the exact `/handoff-slice:issue-load <number>` command embedded right in the description, so anyone opening it on GitHub knows exactly how to pick it up.

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
**Topic**: Move rate limiting from middleware into the gateway layer
**Status**: active

## Objective
...

## Done So Far
...

## Remaining Work
...

## Dead Ends
...

## Decisions Made
...

## Snapshot
...

## Relevant Files
...

## Code Refs
...

## Next Steps
...

## Prerequisites
...

## Gotchas
...

## Follow-up Skills
...
```

Only sections with real content are included (except Dead Ends, which is always present — "None" if nothing failed). Secrets and credentials are redacted before writing, and content already captured elsewhere (specs, PRs, commits, issues) is referenced by path or URL instead of duplicated.

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
