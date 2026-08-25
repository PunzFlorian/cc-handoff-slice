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
**Updated**: <date>
**Topic**: <one-line description>
**Status**: active | blocked | ready-to-close

## Objective
What this slice of work is trying to achieve, in 1-2 sentences.

## Done So Far
- ...

## Remaining Work
- ...

## Decisions Made
| Choice | Why |
|--------|-----|

## Snapshot
**Working**: ...
**Broken**: ...

## Relevant Files
| File | Why it matters |
|------|-----------------|

## Next Steps
1. Specific, actionable, with an expected outcome per step.

## Prerequisites
Env vars, running services, test accounts — omit this section if none.

## Gotchas
Non-obvious traps, or things that look wrong but are intentional.

## Follow-up Skills
Skills the next session should invoke to continue, if any — omit if none.

<!-- ARCHIVE — retained, not loaded. grep this section; don't read it whole. -->

## Dead Ends
Approaches tried and abandoned within this slice, and why. "None" if nothing failed.

## Code Refs
Actual signatures, snippets, or request/response shapes the next session needs.
```

### The archive marker

Everything below the marker is **retained in full and not loaded by default**. `load` reads only the head, then tells the next session the archive exists and how to grep it.

This is a change to what gets *read*, never to what gets *kept*. Dead Ends is the highest-value content a slice carries — it is what stops a future session re-deriving a disproven approach — and it is also the section that grows without bound, because revisions only ever add to it. Splitting the two lets the retention rule stay absolute while the load cost stays flat.

What goes below the marker: **Dead Ends**, **Code Refs**, and later, on revision, struck-through table rows and superseded snippets.

What stays in the head: everything a session needs to decide what to do next — Objective, Snapshot, Remaining Work, Next Steps, Prerequisites, Gotchas, Relevant Files, Decisions Made, Follow-up Skills.

Gotchas stays in the head deliberately. A trap that is still live is not archive material; it's something the next session needs before it starts typing.

### Keep the head small

Target **under ~20 KB above the marker** — roughly 5k tokens, which is what a load should cost. If the head is heading past that, move detail below the marker; never hit the target by leaving something out. A slice that omits a dead end to stay small has traded its main advantage over a summary for nothing.

The target is a guide, not a hard cap — a genuinely large piece of work can justify a larger head. Say so to the user rather than silently truncating.

**Status** is not a mood — `load` and `list` present the slice differently based on it, so pick by these definitions:

- `active` — someone can pick this up right now and make progress. Next Step 1 is something they can just *do*, including "work out where X happens" or "decide between A and B". **An open question you're free to settle yourself is `active`.**
- `blocked` — progress needs something outside this slice: a decision that isn't yours, an unmerged PR, an unanswered question, someone else's work. If no amount of effort gets you moving, it's blocked.
- `ready-to-close` — nothing actionable remains.

Undecided is not blocked. That's the one that gets miscalled.

## 4. Hand back the resume command

Tell the user the uuid, slug, and file path, then end with a fenced block containing **only** the exact command to load this slice in a new session, so it's trivially copy-pasteable:

```
/handoff-slice:load <uuid>
```
