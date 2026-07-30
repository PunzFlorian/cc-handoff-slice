---
name: handoff-slice
description: Extracts a topic-scoped slice of the current conversation into a standalone handoff doc (local file or GitHub issue), loads previously saved slices back in, and revises ones that have gone stale. Activates on mentions of handing off, slicing off, filing an issue for later, saving part of a conversation, or a handoff being out of date, and on session start when saved slices exist.
---

# Handoff Slicing

This plugin captures **one topic** out of a conversation, not the whole session — so a fresh session (or a different person entirely) can load exactly what it needs and nothing else.

Two storage backends, pick based on who needs it:
- **Local** (`create`/`load`/`list`) — fast, private to this machine, for continuing your own work later.
- **GitHub issue** (`issue-create`/`issue-load`) — the issue body is the full, self-contained handoff, so anyone with repo access can pick it up cold from anywhere. No local file involved.

## Trigger phrases

Activate when the user says things like: "hand off", "slice this off", "save this part for later", "extract just the X part", "let's continue this elsewhere", "give me a handoff for this topic", "file this as a github issue", "create an issue for this", "load issue #123", "hand this off to someone else", "the handoff is out of date", "update the slice", "that slice is wrong now".

## Routing intent

- User wants to **save** part of the current conversation for themselves, on this machine → run `/handoff-slice:create <topic>`.
- User wants to **resume** a local slice → run `/handoff-slice:load <uuid or slug>`.
- User isn't sure what's saved locally → run `/handoff-slice:list`.
- User wants to **hand this off to someone else**, or to a machine without this local file → run `/handoff-slice:issue-create <topic>`.
- User wants to **resume from a GitHub issue** → run `/handoff-slice:issue-load <issue number or url>`.
- A slice that already exists has gone **stale** → run `/handoff-slice:update <uuid or slug>`, or `/handoff-slice:issue-update <number>` for an issue-backed one. Not `create` — a new slice loses what the old one learned.

## Stale slices

A loaded slice is a snapshot, not the truth. Work lands after a slice is written and nobody who loads it knows. Two habits:

- When you notice, mid-work, that a loaded slice's plan has been overtaken — a step already done, an approach disproven, a decision reversed — offer to revise it: "This slice's Next Step 1 was done in `50a6373`. Want me to update it?"
- When revising, **mark, don't delete**. A handoff's most valuable content is often a reversal: "we planned X, X was wrong, here's the measurement." Overwrite the plan and you delete the warning. Superseded items move into **Dead Ends** carrying their disproof. See `references/revision-format.md` for the full conventions — never improvise a second update dialect.

## On session start

Check whether `.claude/handoffs/` exists and has entries. If the user's first message suggests they're picking up earlier work, mention the relevant slice(s) and offer to load one — don't load automatically.

## Proactive suggestions

If a distinct sub-topic of the conversation looks finished or is about to be abandoned in favor of something else, offer to slice it off before it's lost: "Want me to save a handoff for this part before we move on?"
