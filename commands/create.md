---
description: Slice out a topic-relevant handoff from this conversation for a future session to load
argument-hint: "topic to extract, e.g. 'the auth bug fix'"
---

Create a handoff doc that captures **only the part of this conversation relevant to one topic** — not the whole session.

## 1. Determine the topic

Treat `$ARGUMENTS` as the topic to extract. If empty, ask the user what they want to hand off before continuing.

## 2. Extract only what's relevant

Go back through the conversation and pull out everything related to the topic — and nothing else. Explicitly leave out unrelated threads, tangents, and other tasks that were discussed in this session. The point of a slice is that a future session loading it gets *only* this topic, not a summary of everything that happened.

While extracting:
- **Redact secrets.** Strip any API keys, tokens, passwords, or personally identifiable information before it goes into the file.
- **Don't restate what's already recorded elsewhere.** If something is fully captured in a spec, PR, issue, or commit, reference it by path or URL instead of re-describing it.
- Prefer showing real code (signatures, snippets, request/response shapes) over describing it in prose.

## 3. Write the file

Generate an id with `uuidgen` (lowercase it), and derive a short kebab-case slug from the topic (2-4 words).

Create the directory if needed and write to `.claude/handoffs/<uuid>-<slug>.md` using this structure. Omit a section if it's genuinely empty, except **Dead Ends** — write "None" there rather than dropping it.

```markdown
# Slice: <short title>

**UUID**: <uuid>
**Created**: <date>
**Topic**: <one-line description>
**Status**: active | blocked | ready-to-close

## Objective
What this slice of work is trying to achieve, in 1-2 sentences.

## Done So Far
- ...

## Remaining Work
- ...

## Dead Ends
Approaches tried and abandoned within this slice, and why. "None" if nothing failed.

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
Actual signatures, snippets, or request/response shapes the next session needs.

## Next Steps
1. Specific, actionable, with an expected outcome per step.

## Prerequisites
Env vars, running services, test accounts — omit this section if none.

## Gotchas
Non-obvious traps, or things that look wrong but are intentional.

## Follow-up Skills
Skills the next session should invoke to continue, if any — omit if none.
```

## 4. Hand back the resume command

Tell the user the uuid, slug, and file path, then end with a fenced block containing **only** the exact command to load this slice in a new session, so it's trivially copy-pasteable:

```
/handoff-slice:load <uuid>
```
