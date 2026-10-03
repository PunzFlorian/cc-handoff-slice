import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextReading, Handoff, Preview, SessionSlice } from '../types'

const LIST = 'handoffs'
const DIR = '.claude/handoffs'
const ISSUE_LABEL = 'handoff-slice'
const STALE_MS = 14 * 24 * 60 * 60 * 1000
// The preview's fixed rows above the text: title, keys, rule.
const HEADER_ROWS = 3
// The engine refuses a Markdown element over 10000 characters.
const MARKDOWN_MAX = 9000

const handoffs = atom({ plugin: 'handoff-slice', key: 'handoffs' } as const, [])
const issues = atom({ plugin: 'handoff-slice', key: 'issues' } as const, null)
const issueNote = atom({ plugin: 'handoff-slice', key: 'issueNote' } as const, null)
const preview = atom({ plugin: 'handoff-slice', key: 'preview' } as const, null)
const top = atom({ plugin: 'handoff-slice', key: 'top' } as const, 0)
const selected = atom({ plugin: 'handoff-slice', key: 'selected' } as const, null)
const mode = atom({ plugin: 'handoff-slice', key: 'mode' } as const, 'text')
const page = atom({ plugin: 'handoff-slice', key: 'page' } as const, 0)

// The header lines /handoff-slice:create writes: `**Field**: value`.
const field = (text: string, name: string) =>
  text.match(new RegExp(`^\\*\\*${name}\\*\\*:\\s*(.+)$`, 'm'))?.[1]?.trim()

// `active — three concrete changes…` reads as `active` in a row.
const shortStatus = (status: string) => status.split(/\s+[—-]\s+/)[0] ?? status

const isStale = (date: string, now: number) => {
  const at = Date.parse(date)
  return Number.isFinite(at) && now - at > STALE_MS
}

const loadCommand = (item: { kind: 'local' | 'issue'; id: string }) =>
  item.kind === 'local' ? `/handoff-slice:load ${item.id}` : `/handoff-slice:issue-load ${item.id}`

type $ = EngineInterface

async function scanLocal($: $): Promise<Handoff[]> {
  if (!(await $.fs.exists(DIR))) return []
  const now = await $.clock.now()
  const entries = (await $.fs.list(DIR)).filter(
    entry => entry.kind === 'file' && entry.name.endsWith('.md'),
  )
  const list = await Promise.all(
    entries.map(async (entry): Promise<Handoff | null> => {
      // One unreadable file (too big, no permission) must not empty the list.
      const text = await $.fs.read(`${DIR}/${entry.name}`).catch(() => null)
      if (text === null) return null
      const date = field(text, 'Updated') ?? field(text, 'Created') ?? '—'
      return {
        kind: 'local',
        id: field(text, 'UUID') ?? entry.name.replace(/\.md$/, ''),
        title: text.match(/^#\s+(?:Slice:\s*)?(.+)$/m)?.[1]?.trim() ?? entry.name,
        status: shortStatus(field(text, 'Status') ?? '?'),
        date,
        isStale: isStale(date, now),
      }
    }),
  )
  return list.filter(item => item !== null).sort((a, b) => b.date.localeCompare(a.date))
}

async function scanIssues($: $): Promise<void> {
  try {
    const { exitCode, stdout, stderr } = await $.process.run(
      ['gh', 'issue', 'list', '--label', ISSUE_LABEL, '--state', 'open',
        '--json', 'number,title,updatedAt', '--limit', '50'],
      { timeoutMs: 15_000 },
    )
    if (exitCode !== 0) {
      await update($, issues, () => [])
      await update($, issueNote, () => stderr.trim().split('\n')[0] || 'gh failed')
      return
    }
    const now = await $.clock.now()
    const rows = JSON.parse(stdout) as { number: number; title: string; updatedAt: string }[]
    await update($, issues, () =>
      rows.map(row => ({
        kind: 'issue' as const,
        id: String(row.number),
        title: row.title.replace(/^\[?handoff(?:-slice)?\]?:?\s*/i, ''),
        status: 'open',
        date: row.updatedAt.slice(0, 10),
        isStale: isStale(row.updatedAt, now),
      })),
    )
    await update($, issueNote, () => null)
  } catch {
    await update($, issues, () => [])
    await update($, issueNote, () => 'gh not available')
  }
}

// Keeps the rows on screen while it rescans, so the pane never flashes empty.
async function refresh($: $) {
  const local = await scanLocal($)
  await update($, handoffs, () => local)
  await scanIssues($)
}

const rowKey = (item: { kind: string; id: string }) => `row-${item.kind}-${item.id}`

type Line = { text: string; isHeading: boolean; isStart: boolean; source: number }

// Breaks one source line at the last space that fits, or hard where none does.
function wrapRow(source: string, width: number): string[] {
  const rows: string[] = []
  let rest = source
  while (rest.length > width) {
    const space = rest.lastIndexOf(' ', width)
    const cut = space > width / 2 ? space : width
    rows.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^ /, '')
  }
  rows.push(rest)
  return rows
}

// The preview draws its own window of rows under a fixed header, so it wraps
// the text itself to know how many rows there are and where headings land.
function wrapLines(body: string, width: number): Line[] {
  return body.split('\n').flatMap((source, at) => {
    const isHeading = /^#{1,6}\s/.test(source)
    return wrapRow(source, Math.max(10, width)).map((text, index) => ({ text, isHeading, isStart: index === 0, source: at }))
  })
}

type Page = { text: string; start: number; heading: string }

// Markdown mode shows one page at a time, each cut to fit under the header so
// nothing scrolls: a page starts at every `#`/`##` heading, a section too long
// for the pane splits at blank lines, and a fenced code block stays whole.
function markdownPages(body: string, width: number, room: number): Page[] {
  const fits = Math.max(4, room - 2)
  const rowsOf = (line: string) => wrapRow(line, Math.max(10, width)).length

  const blocks: { start: number; lines: string[] }[] = []
  let block: { start: number; lines: string[] } | null = null
  let isFenced = false
  body.split('\n').forEach((line, at) => {
    const isFence = /^\s*(```|~~~)/.test(line)
    if (!isFenced && !isFence && line.trim() === '') {
      block = null
      return
    }
    if (!block || (!isFenced && /^#{1,6}\s/.test(line))) {
      block = { start: at, lines: [] }
      blocks.push(block)
    }
    block.lines.push(line)
    if (isFence) isFenced = !isFenced
  })

  const pages: (Page & { rows: number; lines: string[] })[] = []
  let heading = ''
  for (const { start, lines } of blocks) {
    const first = lines[0] ?? ''
    if (/^#{1,6}\s/.test(first)) heading = first.replace(/^#+\s*/, '')
    const isSection = /^##?\s/.test(first)
    // A block taller than a page goes in page-sized runs of its lines.
    const runs: { start: number; lines: string[]; rows: number }[] = []
    lines.forEach((line, index) => {
      const run = runs.at(-1)
      if (!run || run.rows + rowsOf(line) > fits) runs.push({ start: start + index, lines: [line], rows: rowsOf(line) })
      else {
        run.lines.push(line)
        run.rows += rowsOf(line)
      }
    })
    runs.forEach((run, index) => {
      const current = pages.at(-1)
      const chars = run.lines.join('\n').length
      if (!current || (isSection && index === 0) || current.rows + run.rows + 1 > fits
        || current.text.length + chars > MARKDOWN_MAX) {
        pages.push({ text: '', start: run.start, heading, rows: 0, lines: [] })
      }
      const into = pages.at(-1)!
      into.lines.push(...(into.lines.length ? [''] : []), ...run.lines)
      into.text = into.lines.join('\n')
      into.rows += run.rows + 1
    })
  }
  return pages.map(({ text, start, heading }) => ({ text: text.slice(0, MARKDOWN_MAX), start, heading }))
}

// What the last preview drawing measured, for the scroll and section keys.
let layout = { rows: 0, room: 1, headings: [] as number[], sources: [] as number[], pageStarts: [] as number[] }

async function scrollBy($: $, by: number) {
  const max = Math.max(0, layout.rows - layout.room)
  await update($, top, at => Math.min(max, Math.max(0, (at ?? 0) + by)))
}

async function jumpHeading($: $, direction: 1 | -1) {
  const at = await read($, top)
  const target = direction > 0
    ? layout.headings.find(row => row > at)
    : [...layout.headings].reverse().find(row => row < at)
  if (target !== undefined) await scrollBy($, target - at)
}

async function turnPage($: $, by: number) {
  const last = Math.max(0, layout.pageStarts.length - 1)
  await update($, page, at => Math.min(last, Math.max(0, (at ?? 0) + by)))
}

// Switching keeps the place: the page holding the top row, or the row a page starts on.
async function toggleMode($: $) {
  if ((await read($, mode)) === 'text') {
    const source = layout.sources[await read($, top)] ?? 0
    const index = layout.pageStarts.findLastIndex(start => start <= source)
    await update($, page, () => Math.max(0, index))
    await update($, mode, () => 'markdown' as const)
  } else {
    const start = layout.pageStarts[await read($, page)] ?? 0
    const row = layout.sources.findIndex(source => source >= start)
    await update($, top, () => Math.max(0, row))
    await update($, mode, () => 'text' as const)
  }
}

async function openPreview($: $, item: Handoff) {
  let body: string
  try {
    if (item.kind === 'local') {
      const name = (await $.fs.list(DIR)).find(entry => entry.name.startsWith(item.id))?.name
      body = name ? await $.fs.read(`${DIR}/${name}`) : 'File not found.'
    } else {
      const run = await $.process.run(['gh', 'issue', 'view', item.id, '--json', 'body', '-q', '.body'])
      body = run.exitCode === 0 ? run.stdout : run.stderr
    }
  } catch (error) {
    body = `Could not read: ${String(error)}`
  }
  const next: Preview = { kind: item.kind, id: item.id, title: item.title, body }
  await update($, selected, () => rowKey(item))
  await update($, top, () => 0)
  await update($, page, () => 0)
  await update($, preview, () => next)
}

// Back to the list with the ring on the row that was previewed.
async function closePreview($: $) {
  await update($, preview, () => null)
  const key = await read($, selected)
  if (key) await $.ui.focus({ requestId: LIST, key }).catch(() => undefined)
}

async function fillLoad($: $, item: { kind: 'local' | 'issue'; id: string }) {
  await $.prompt.fill({ text: loadCommand(item) })
  await update($, preview, () => null)
  $.ui.toast('Load command is in your prompt. Press Enter to load it.')
}

// `l` in the list loads the row the ring is on, or the first one.
async function loadSelected($: $) {
  const key = await read($, selected)
  const items = [...(await read($, handoffs)), ...((await read($, issues)) ?? [])]
  const item = items.find(one => rowKey(one) === key) ?? items[0]
  if (item) await fillLoad($, item)
}

// ── The band above the prompt: context size and a Slice now button ──

const context = atom({ plugin: 'handoff-slice', key: 'context' } as const, null)
const dismissedTier = atom({ plugin: 'handoff-slice', key: 'dismissedTier' } as const, 0)

type Tiers = { floor: number; notice: number; offer: number; urgent: number }

// Kept in step with hooks/restart-advisor.sh by hand: the break-even tiers per
// model (README), and the turns after which a restart pays for itself.
const tiersFor = (model: string): Tiers =>
  model.startsWith('claude-opus-5-5')
    ? { floor: 38_000, notice: 200_000, offer: 300_000, urgent: 500_000 }
    : { floor: 57_000, notice: 100_000, offer: 200_000, urgent: 300_000 }

const paybackFor = (model: string) =>
  model.startsWith('claude-opus-5-5') ? [0, 10, 7, 5] : [0, 20, 7, 4]

type Config = { hints?: string; floor?: number; tiers?: Partial<Tiers>; models?: Record<string, { floor?: number; tiers?: Partial<Tiers> }> }

async function readConfig($: $, path: string): Promise<Config | undefined> {
  try {
    return (await $.fs.exists(path)) ? (JSON.parse(await $.fs.read(path)) as Config) : undefined
  } catch {
    return undefined
  }
}

// Project config wins over user config wins over the measured default, and in
// each file a key for this model beats the flat key, as the shell hook reads it.
async function settings($: $, model: string) {
  const configDir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('HOME')) ?? '~'}/.claude`
  const files = [await readConfig($, '.claude/handoff-slice.json'), await readConfig($, `${configDir}/handoff-slice.json`)]
  const pick = (get: (file: Config) => unknown) => files.map(file => (file ? get(file) : undefined)).find(value => value !== undefined)
  const number = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : fallback

  const defaults = tiersFor(model)
  const tier = (name: keyof Tiers) =>
    number(pick(file => file.models?.[model]?.tiers?.[name] ?? file.tiers?.[name]), defaults[name])
  const envHints = await $.env.get('HANDOFF_SLICE_HINTS')
  const hints = String(envHints ?? pick(file => file.hints) ?? 'on')

  return {
    hints: ['off', 'false', '0', 'no'].includes(hints) ? 'off' : hints === 'quiet' ? 'quiet' : 'on',
    floor: number(pick(file => file.models?.[model]?.floor ?? file.floor), defaults.floor),
    notice: tier('notice'),
    offer: tier('offer'),
    urgent: tier('urgent'),
  }
}

type Message = { role: string; text: string; toolUses: readonly { tool: string; input: Record<string, unknown> }[] }

// A typed command, as the transcript records it or as plain text.
const SLICE_COMMAND = /\/handoff-slice:(issue-)?(load|create)(?:<\/command-name>[\s\S]*?<command-args>)?[ \t]*([^<\s]*)/g

const sliceOf = (isIssue: boolean, action: string, arg: string): SessionSlice => ({
  kind: isIssue ? 'issue' : 'local',
  // An issue may be named by its URL; its number is what the commands take.
  id: action === 'create' || !arg ? null : isIssue ? (arg.match(/(\d+)\/?$/)?.[1] ?? arg) : arg,
})

// The last slice this conversation loaded or created, typed or through the
// skill. /clear empties the transcript, so a fresh conversation has none.
function sessionSlice(messages: readonly Message[]): SessionSlice | null {
  let found: SessionSlice | null = null
  for (const message of messages) {
    if (message.role === 'user') {
      for (const [, issue, action = '', arg = ''] of message.text.matchAll(SLICE_COMMAND)) {
        found = sliceOf(Boolean(issue), action, arg)
      }
    }
    for (const use of message.toolUses) {
      const skill = use.tool === 'Skill' ? String(use.input.skill ?? '') : ''
      const named = skill.match(/^handoff-slice:(issue-)?(load|create)$/)
      if (named) found = sliceOf(Boolean(named[1]), named[2] ?? '', String(use.input.args ?? '').trim().split(/\s+/)[0] ?? '')
    }
  }
  return found
}

// Reads the context size and settles the tier the band draws, once per turn.
async function measure($: $) {
  const [usage, model, messages] = await Promise.all([$.session.usage(), $.session.model(), $.session.messages()])
  const tokens = usage.context.tokens ?? 0
  const config = await settings($, model)
  // A threshold of 0 switches that tier off, as in the shell hook.
  const at = (threshold: number) => threshold > 0 && tokens >= threshold
  let tier: ContextReading['tier'] = at(config.urgent) ? 3 : at(config.offer) ? 2 : at(config.notice) ? 1 : 0
  if (config.hints === 'off' || tokens < config.floor || (config.hints === 'quiet' && tier < 3)) tier = 0
  const slice = Array.isArray(messages) ? sessionSlice(messages) : null
  const reading: ContextReading = { tokens, tier, turns: paybackFor(model)[tier] ?? 0, slice }
  await update($, context, () => reading)
}

// Updates the slice this conversation already works on, or cuts a new one.
async function sliceNow($: $, slice: SessionSlice | null) {
  if (!slice) {
    await $.prompt.fill({ text: '/handoff-slice:create ' })
    $.ui.toast('Name the topic and press Enter. Then /clear and load the slice in the fresh session.')
    return
  }
  const command = slice.kind === 'issue' ? '/handoff-slice:issue-update' : '/handoff-slice:update'
  await $.prompt.fill({ text: slice.id ? `${command} ${slice.id}` : command })
  $.ui.toast('Press Enter to bring the slice up to date. Then /clear and load it in the fresh session.')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'handoffs',
      description: "Browse this repo's handoff slices in a side panel",
    })
    const local = await scanLocal($)
    await update($, handoffs, () => local)
    if (local.length > 0) {
      $.ui.toast(`${local.length} handoff${local.length === 1 ? '' : 's'} saved here. /handoffs to browse`)
    }

    const started = await next(e)
    // A resumed session can open already past a tier.
    await measure($).catch(() => undefined)
    return started
  })

  on('command.run', { command: 'handoffs' }, async ($, e) => {
    // Opening an id that is already open does nothing, so a pane left open but
    // undrawn (the terminal got too narrow) would never come back: reopen it.
    if ((await $.ui.panes()).some(pane => pane.id === LIST)) {
      await $.ui.close({ id: LIST })
    }
    await update($, preview, () => null)
    const opened = await $.ui.open({ id: LIST, title: 'Handoffs', focus: true, closeOnEscape: true })
    // gh is slow; the local list draws first and issues fill in after.
    void refresh($).catch(error => $.ui.log(`handoff-slice: refresh failed: ${String(error)}`))

    if (!opened.isPlaced) {
      return { text: `Handoffs panel is open but not shown: ${opened.reason}` }
    }
    // Absent where no terminal measured (a test, a headless run).
    const room = e.presentation as typeof e.presentation | undefined
    return {
      text: room?.isFullscreen && room.columns < 110
        ? `Handoffs panel opened. The terminal is ${room.columns} columns; it hides below 110.`
        : 'Handoffs panel opened.',
    }
  })

  // Esc (or the close mark) while previewing goes back to the list instead.
  // Esc has already handed the keys to the prompt by then, so ask for them back.
  on('ui.close', async ($, e, next) => {
    if (e.id !== LIST || e.origin.kind === 'unload' || !(await read($, preview))) return next(e)
    await update($, preview, () => null)
    await $.ui.open({ id: LIST, title: 'Handoffs', focus: true, closeOnEscape: true })
    const key = await read($, selected)
    if (key) await $.ui.focus({ requestId: LIST, key }).catch(() => undefined)
    return { value: undefined }
  })

  // Remembers which row the ring is on, for `l` and for coming back from a preview.
  on('ui.focus', async ($, e, next) => {
    if (e.requestId === LIST && e.element?.startsWith('row-')) {
      await update($, selected, () => e.element ?? null)
    }
    return next(e)
  })

  // The preview scrolls its own rows so the header stays put.
  on('ui.scroll', async ($, e, next) => {
    if (e.requestId !== LIST || !(await read($, preview))) return next(e)
    if ((await read($, mode)) === 'text') await scrollBy($, e.by)
    // A page fits whole, so only the page keys (a move of more than a wheel
    // tick or two) turn it; the wheel would flip pages by accident.
    else if (Math.abs(e.by) > 2) await turnPage($, Math.sign(e.by))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: LIST }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const shown = await read($, preview)

    if (shown) {
      const lines = wrapLines(shown.body, e.props.bodyColumns)
      const room = Math.max(1, e.props.scroll.bodyRows - HEADER_ROWS)
      const pages = markdownPages(shown.body, e.props.bodyColumns, room)
      layout = {
        rows: lines.length,
        room,
        headings: lines.flatMap((line, index) => (line.isHeading && line.isStart ? [index] : [])),
        sources: lines.map(line => line.source),
        pageStarts: pages.map(one => one.start),
      }
      const at = Math.min(await read($, top), Math.max(0, lines.length - room))
      const half = Math.max(1, Math.floor(room / 2))
      const isMarkdown = (await read($, mode)) === 'markdown'
      const pageAt = Math.min(await read($, page), Math.max(0, pages.length - 1))
      const shownPage = pages[pageAt]

      return (
        <Box flexDirection="column">
          <Text bold wrap="truncate-end">{shown.kind === 'issue' ? `#${shown.id} ` : ''}{shown.title}</Text>
          <Box flexDirection="row" gap={2}>
            <Button key="preview-back" hotkey="b" plain autoFocus onPress={() => closePreview($)}>back</Button>
            <Button key="preview-load" hotkey="l" plain onPress={() => fillLoad($, shown)}>load</Button>
            <Button key="preview-mode" hotkey="m" plain onPress={() => toggleMode($)}>{isMarkdown ? 'text' : 'markdown'}</Button>
            {!isMarkdown && <Button key="preview-down" hotkey="j" plain onPress={() => scrollBy($, half)}>down</Button>}
            {!isMarkdown && <Button key="preview-up" hotkey="k" plain onPress={() => scrollBy($, -half)}>up</Button>}
            <Button key="preview-next" hotkey="n" plain onPress={() => (isMarkdown ? turnPage($, 1) : jumpHeading($, 1))}>{isMarkdown ? 'next' : 'next §'}</Button>
            <Button key="preview-prev" hotkey="p" plain onPress={() => (isMarkdown ? turnPage($, -1) : jumpHeading($, -1))}>{isMarkdown ? 'prev' : 'prev §'}</Button>
          </Box>
          <Text key="preview-position" dimColor wrap="truncate-end">
            {isMarkdown
              ? `── page ${pageAt + 1}/${pages.length}${shownPage?.heading ? ` · ${shownPage.heading}` : ''} · PgUp/PgDn turn · Esc back`
              : `── ${lines.length === 0 ? 0 : at + 1}-${Math.min(lines.length, at + room)} of ${lines.length} · wheel/PgUp/PgDn scroll · Esc back`}
          </Text>
          {isMarkdown
            ? <Markdown key={`page-${pageAt}`} text={shownPage?.text ?? ''} />
            : lines.slice(at, at + room).map(line => (
              <Text bold={line.isHeading} color={line.isHeading ? 'cyan' : undefined} wrap="truncate-end">
                {line.text || ' '}
              </Text>
            ))}
        </Box>
      )
    }

    const local = await read($, handoffs)
    const remote = await read($, issues)
    const note = await read($, issueNote)
    const first = local[0] ?? remote?.[0]

    const row = (item: Handoff) => (
      <Box key={`${item.kind}-${item.id}`} flexDirection="column" marginBottom={1}>
        <Button key={rowKey(item)} plain autoFocus={item === first ? true : undefined} onPress={() => openPreview($, item)}>
          {`${item.kind === 'issue' ? `#${item.id} ` : ''}${item.title}`}
        </Button>
        <Box flexDirection="row" gap={1}>
          <Text dimColor>{item.date}</Text>
          <Text color={item.status === 'active' || item.status === 'open' ? 'green' : undefined} dimColor={item.status !== 'active' && item.status !== 'open'}>
            {item.status}
          </Text>
          {item.isStale && <Text color="yellow">stale</Text>}
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2} marginBottom={1}>
          <Text dimColor>↑↓ select · Enter preview</Text>
          <Button key="load-selected" hotkey="l" plain onPress={() => loadSelected($)}>load</Button>
          <Button key="refresh" hotkey="r" plain onPress={() => refresh($)}>refresh</Button>
        </Box>

        <Text bold underline>Local</Text>
        {local.length === 0 ? (
          <Text dimColor>No slices in {DIR}/. /handoff-slice:create makes one.</Text>
        ) : (
          local.map(row)
        )}

        <Box marginTop={1} flexDirection="column">
          <Text bold underline>GitHub issues</Text>
          {remote === null && <Text dimColor>Loading…</Text>}
          {remote !== null && note !== null && <Text dimColor>{note}</Text>}
          {remote !== null && note === null && remote.length === 0 && (
            <Text dimColor>No open issues labelled {ISSUE_LABEL}.</Text>
          )}
          {remote?.map(row)}
        </Box>
      </Box>
    )
  })

  // ── band ──

  // /clear starts the conversation over with no session.start after it: the
  // old size and a dismiss from the old conversation must not carry over.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, context, () => null)
      await update($, dismissedTier, () => 0)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await measure($).catch(() => undefined)
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const reading = await read($, context)
    if (e.props.hasSurvey || !reading || reading.tier === 0) return next(e)
    const { tier, turns, slice } = reading
    if (tier <= (await read($, dismissedTier))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const color = tier === 3 ? 'red' : tier === 2 ? 'yellow' : undefined

    return (
      <Box flexDirection="row" gap={1}>
        <Text color={color} dimColor={tier === 1}>●</Text>
        <Text dimColor={tier === 1} wrap="truncate-end">
          {`${Math.round(reading.tokens / 1000)}k context · a fresh session pays off after ~${turns} more turns`}
        </Text>
        <Button key="slice-now" hotkey="s" variant="primary" onPress={() => sliceNow($, slice)}>{slice ? 'Update slice' : 'Slice now'}</Button>
        <Button key="slice-dismiss" hotkey="d" plain dimColor onPress={() => update($, dismissedTier, () => tier)}>dismiss</Button>
      </Box>
    )
  })
}
