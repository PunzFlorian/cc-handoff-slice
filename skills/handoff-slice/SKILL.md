---
name: handoff-slice
description: Extracts a topic-scoped slice of the current conversation into a standalone handoff doc (local file or GitHub issue), loads previously saved slices back in, and revises ones that have gone stale. Activates on mentions of handing off, slicing off, filing an issue for later, saving part of a conversation, or a handoff being out of date, on session start when saved slices exist, and mid-session once the context has grown past the point where slicing out and restarting costs less than continuing.
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

## Restarting mid-session

Slicing is not only an end-of-session ritual. Past a certain context size, continuing a session is the expensive option and a slice-and-restart pays for itself in a handful of turns — but that moment arrives in the middle of the work, not at the end of it, and nothing about it is self-announcing.

A `UserPromptSubmit` hook reports the current context size when it becomes relevant, prefixed `handoff-slice:`. That line is the trigger. Act on it:

| context | offer a restart when |
|---------|----------------------|
| below ~57k | **never** — say nothing |
| ~57k–100k | say nothing |
| ~100k–200k | more than ~20 turns of work remain |
| ~200k–300k | more than ~7 turns remain — offer it |
| ~300k and up | more than ~4 turns remain — offer it now |

**The offer is always two steps.** A slice without a restart saves nothing at all; it just adds the cost of writing it.

1. `/handoff-slice:update <uuid>` if a slice is loaded, `/handoff-slice:create <topic>` if not.
2. `/clear`, then `/handoff-slice:load <uuid>` in the fresh session.

Say both, in that order, and say what it's worth: at high context every further turn is charged against the whole prefix, and that is the cost the restart removes.

**Whether enough work remains is the user's call, not yours.** You know the context size; they know what's left. Offer, state the number, and take the answer. If they decline, record the declined tier so the hook doesn't ask again on the next prompt:

```
echo <tier> > "${TMPDIR:-/tmp}/handoff-slice-<session_id>.declined-tier"
```

where tier is 1 for the ~100k band, 2 for ~200k, 3 for ~300k+. The hook stays quiet until the next band up.

**The floor is a hard rule.** Below ~57k a restart costs more than continuing, no matter how much work is left — the fresh session pays its own baseline plus the slice before doing anything. Never offer below it, including when the user asks about cost directly. Offering when the advice is wrong is how the whole mechanism gets tuned out.

**If the hint never appears**, the hook may be off (`/handoff-slice:hints`) or unable to read the transcript. You can check once, by hand, when the signs of a long session show up — a compaction notice, or the user asking about cost or speed:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/context-size.sh"
```

It prints a bare number, or `0` when it can't tell. Treat `0` as unknown, not as small, and don't run it on a schedule — the hook exists so this isn't something you poll.

## Stale slices

A loaded slice is a snapshot, not the truth. Work lands after a slice is written and nobody who loads it knows. Two habits:

- When you notice, mid-work, that a loaded slice's plan has been overtaken — a step already done, an approach disproven, a decision reversed — offer to revise it: "This slice's Next Step 1 was done in `50a6373`. Want me to update it?"
- When revising, **mark, don't delete**. A handoff's most valuable content is often a reversal: "we planned X, X was wrong, here's the measurement." Overwrite the plan and you delete the warning. Superseded items move into **Dead Ends** carrying their disproof. See `references/revision-format.md` for the full conventions — never improvise a second update dialect.

## On session start

Check whether `.claude/handoffs/` exists and has entries. If the user's first message suggests they're picking up earlier work, mention the relevant slice(s) and offer to load one — don't load automatically.

## One slice at a time

Load **one** slice into a session. This holds everywhere, not just inside `load`.

A loaded slice isn't context that gets consulted and released — it stays in the prefix and is charged on every subsequent request, used or not. Two slices is that cost twice, and in practice the second one is usually the one nobody opens: it matched the topic, it looked useful, and the session's actual work turned out to be somewhere else.

So when more than one slice looks relevant, name them with their sizes and let the user pick the one the current task needs. If the work genuinely moves onto the second topic later, load it then — by which point the first is likely worth updating and dropping anyway.

## Proactive suggestions

If a distinct sub-topic of the conversation looks finished or is about to be abandoned in favor of something else, offer to slice it off before it's lost: "Want me to save a handoff for this part before we move on?"
