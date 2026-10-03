import { expect, test } from 'claude-code/testing'

const UUID = '89eb740d-1585-44cb-84ef-bf7785dfb298'
// Over the engine's 10000-character Markdown limit, as real slices are.
const LONG = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${'x'.repeat(400)}`).join('\n\n')
const SLICE = `# Slice: restart threshold

**UUID**: ${UUID}
**Created**: 2026-08-11
**Updated**: 2026-08-11
**Topic**: when to slice
**Status**: active — three changes to make

## Context
${LONG}

## Next Steps
- do the thing
`

const PANE = { title: 'Handoffs', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`lists, previews and loads a slice in one pane (${surface})`, async ($, on) => {
    const filled: string[] = []
    const opened: string[] = []

    on('fs.exists', () => ({ value: true }))
    on('fs.list', () => ({ value: [{ name: `${UUID}-restart.md`, kind: 'file', size: SLICE.length, mtimeMs: 0, isLink: false }] }))
    on('fs.read', () => ({ value: SLICE }))
    on('clock.now', () => ({ value: Date.parse('2026-10-03') }))
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'gh: not logged in' } as never }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.open', (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true as const } }
    })
    on('ui.close', (_$, e) => {
      opened.splice(opened.indexOf(e.id), 1)
      return { value: undefined }
    })
    on('ui.panes', () => ({ value: opened.map(id => ({ id, title: id, isShown: true, isFocused: true, isPlaced: true })) as never }))
    on('ui.toast', () => ({ value: undefined }))
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { isFilled: true }
    })

    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo', surface, isInteractive: true })
    await $.command.run({ command: 'handoffs', args: '' } as never)
    // A second /handoffs reopens the pane instead of doing nothing.
    await $.command.run({ command: 'handoffs', args: '' } as never)
    expect(opened).toEqual(['handoffs'])

    const ui = await $.ui.mount({ plugin: 'handoff-slice', surface, component: 'Pane', requestId: 'handoffs', props: PANE } as never)
    expect(await ui.find({ text: /restart threshold/ })).toBeDefined()
    expect(await ui.find({ text: /stale/ })).toBeDefined()
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ text: /gh: not logged in/ })).toBeDefined()

    // `l` in the list loads the selected row without opening a preview.
    await ui.press({ key: 'load-selected' })
    expect(filled).toEqual([`/handoff-slice:load ${UUID}`])

    await ui.press({ key: `row-local-${UUID}` })
    expect(opened).toEqual(['handoffs'])
    expect(await ui.find({ text: /^── 1-/ })).toBeDefined()

    // Scrolling moves the text under a header that stays drawn.
    await ui.press({ key: 'preview-next' })
    expect(await ui.find({ text: /^## Context/ })).toBeDefined()
    await ui.press({ key: 'preview-down' })
    expect(await ui.find({ text: /^## Context/ })).toBeUndefined()
    expect(await ui.find({ key: 'preview-back' })).toBeDefined()
    expect(await ui.find({ text: /restart threshold/ })).toBeDefined()

    // Markdown mode: one page that fits under the header, n/p turn pages.
    await ui.press({ key: 'preview-mode' })
    const firstPage = await ui.find({ type: 'Markdown' })
    expect(firstPage).toBeDefined()
    expect(await ui.find({ text: /^── page \d+\/\d+ · Context/ })).toBeDefined()
    await ui.press({ key: 'preview-next' })
    expect(await ui.find({ type: 'Markdown' })).not.toEqual(firstPage)
    expect(await ui.find({ key: 'preview-back' })).toBeDefined()
    await ui.press({ key: 'preview-mode' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()

    // Back returns to the list in the same pane.
    await ui.press({ key: 'preview-back' })
    expect(opened).toEqual(['handoffs'])
    expect(await ui.find({ text: /^── / })).toBeUndefined()
    expect(await ui.find({ key: `row-local-${UUID}` })).toBeDefined()
  })
}
