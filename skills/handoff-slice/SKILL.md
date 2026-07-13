---
name: handoff-slice
description: Extracts a topic-scoped slice of the current conversation into a standalone handoff doc, and loads previously saved slices. Activates on mentions of handing off, slicing off, or saving part of a conversation for later, and on session start when saved slices exist.
---

# Handoff Slicing

This plugin captures **one topic** out of a conversation, not the whole session — so a fresh session can load exactly what it needs and nothing else.

## Trigger phrases

Activate when the user says things like: "hand off", "slice this off", "save this part for later", "extract just the X part", "let's continue this elsewhere", "give me a handoff for this topic".

## Routing intent

- User wants to **save** part of the current conversation → run `/handoff-slice:create <topic>`.
- User wants to **resume** a saved slice → run `/handoff-slice:load <uuid or slug>`.
- User isn't sure what's saved → run `/handoff-slice:list`.

## On session start

Check whether `.claude/handoffs/` exists and has entries. If the user's first message suggests they're picking up earlier work, mention the relevant slice(s) and offer to load one — don't load automatically.

## Proactive suggestions

If a distinct sub-topic of the conversation looks finished or is about to be abandoned in favor of something else, offer to slice it off before it's lost: "Want me to save a handoff for this part before we move on?"
