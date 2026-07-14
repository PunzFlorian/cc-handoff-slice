---
description: Slice out a topic-relevant handoff and file it as a GitHub issue anyone with repo access can pick up
argument-hint: "topic to extract, e.g. 'the auth bug fix'"
---

Create a handoff for one topic and publish it as a self-contained GitHub issue — no local file, no dependency on this machine. Anyone with access to this repo's issues can pick it up cold.

## 1. Determine the topic

Treat `$ARGUMENTS` as the topic to extract. If empty, ask the user what they want to hand off before continuing.

## 2. Check prerequisites

Run `gh auth status`. If it fails, tell the user plainly (`gh` not installed or not authenticated) and stop — don't attempt anything else.

Ensure a `handoff-slice` label exists on this repo so these issues stay filterable later (`gh issue list --label handoff-slice`). Try to create it and ignore the error if it already exists:

```
gh label create handoff-slice --color BFD4F2 --description "Parked context from a handoff-slice session" 2>/dev/null
```

## 3. Extract only what's relevant

Same rules as the local `/handoff-slice:create` command:
- Pull out only what's relevant to the topic — nothing else from this session.
- **Redact secrets.** Strip API keys, tokens, passwords, PII before anything gets written.
- **Don't restate what's already recorded elsewhere** — reference specs/PRs/commits/other issues by path or URL instead of duplicating them.
- Prefer real code (signatures, snippets, request/response shapes) over prose descriptions.

## 4. Build the body

Same section structure as the local template, but **no header block and no `Status` field** — GH's own title, creation date, and open/closed state already carry that:

```markdown
## Objective
...

## Done So Far
- ...

## Remaining Work
- ...

## Dead Ends
Things tried and abandoned, and why. "None" if nothing failed — never omit this section.

## Decisions Made
| Choice | Why |
|--------|-----|

## Snapshot
**Working**: ...
**Broken**: ...

## Relevant Files
| File | Why it matters |
|------|-----------------|

## Code Refs
Actual signatures, snippets, or request/response shapes the next person needs.

## Next Steps
1. Specific, actionable, with an expected outcome per step.

## Prerequisites
Env vars, running services, test accounts — omit if none.

## Gotchas
Non-obvious traps, or things that look wrong but are intentional.

## Follow-up Skills
Skills the next session should invoke to continue — omit if none.
```

## 5. Create the issue

Write the body to a temp file, then:

```
gh issue create --title "<short topic-derived title>" --body-file <tmpfile> --label handoff-slice
```

## 6. Embed the resume command in the issue itself

The resume command can't be written before the issue exists — its number isn't known yet. So immediately after creating it:

1. Parse the issue number out of the URL `gh issue create` returned.
2. Rebuild the body with a short block inserted right at the top, before `## Objective`:
   ```
   > **Resume this handoff in Claude Code:**
   > ```
   > /handoff-slice:issue-load <number>
   > ```
   ```
3. Run `gh issue edit <number> --body-file <updated-tmpfile>` to write that back onto the same issue, so anyone opening it on GitHub sees the exact command to run, not just the context.

Clean up temp files when done.

## 7. Confirm to the user

Report the issue number/URL, then end with a fenced block containing only the resume command, for convenience:

```
/handoff-slice:issue-load <number>
```
