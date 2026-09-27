---
description: Turn the automatic context-size restart hints on, off, or quiet
argument-hint: "on | quiet | off  (optional — with no argument, reports the current setting)"
---

Control the `UserPromptSubmit` hook that tells the model how large the session's context has grown, so it can offer a slice-and-restart at the point where that becomes cheaper than continuing.

## With no argument: report, don't change

Print the **effective** setting and — the part that actually matters — **which layer set it**. Three layers override each other, so "it's on" is not useful on its own; "it's on because nothing has set it" and "it's on because this repo's config says so" lead to different next actions.

Resolve in this order, first hit wins:

1. `HANDOFF_SLICE_HINTS` environment variable
2. `<repo>/.claude/handoff-slice.json` → `.hints`
3. `~/.claude/handoff-slice.json` (or `$CLAUDE_CONFIG_DIR`) → `.hints`
4. built-in default: `on`

Report it plainly, naming the file or variable that won and showing the ones that lost:

```
hints: quiet  (set by .claude/handoff-slice.json in this repo)
  env HANDOFF_SLICE_HINTS   not set
  ~/.claude/handoff-slice.json   "on"   — overridden by the project config
```

Then print the thresholds in force for this session's model. The defaults differ per model, so name the model and say where each number came from — the built-in default for that model, a flat `floor`/`tiers` key, or a `models.<model-id>` key (which beats the flat one within a file). Get the model from:

```
bash "${CLAUDE_PLUGIN_ROOT}/scripts/context-size.sh" --model
```

It prints `<tokens> <model-id>`; `unknown` means the hook falls back to the general defaults (57k floor, tiers at 100k / 200k / 300k). A customised floor or tier silently changes when hints appear, and a tier set to `0` never fires — both are worth saying out loud.

## With an argument: write it

`$ARGUMENTS` is one of `on`, `quiet`, `off` — anything else, say so and stop rather than writing a value the hook will ignore.

| value | effect |
|-------|--------|
| `on` | hints at every tier (default) |
| `quiet` | only the highest tier — the point where a restart pays back within a handful of turns |
| `off` | never |

Write `.hints` into `<repo>/.claude/handoff-slice.json`, creating the file if needed and **preserving any other keys already in it** — `floor`, `tiers` and `models` live in the same file and must survive. If `--global` is passed, write to `~/.claude/handoff-slice.json` instead.

Then confirm what changed and, when a higher-precedence layer would still override it, say so:

> Set `hints: off` in this repo. Note `HANDOFF_SLICE_HINTS=on` is set in your environment and takes precedence — the hints will keep appearing until that's unset.

Silently writing a setting that something else overrides is the one outcome worth going out of the way to prevent.

## What `off` does and doesn't do

`off` silences the hook. It does not unregister it — plugin hooks are registered as long as the plugin is enabled, so the script still runs on each prompt, exits immediately, and prints nothing. The cost of that is a few milliseconds of shell and nothing in context. Only disabling the plugin stops it running at all.

Say this if the user asks why the hook still appears in `/hooks`.
