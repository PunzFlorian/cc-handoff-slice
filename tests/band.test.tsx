import { expect, test } from 'claude-code/testing'

const BAND = { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} } as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`offers Slice now past a tier and stays dismissed until the next (${surface})`, async ($, on) => {
    let tokens = 50_000
    let messages: unknown[] = []
    const filled: string[] = []

    on('fs.exists', () => ({ value: false }))
    on('fs.list', () => ({ value: [] }))
    on('env.get', () => ({ value: undefined }))
    on('clock.now', () => ({ value: 0 }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.toast', () => ({ value: undefined }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window: 1_000_000 }, rateLimits: [] } as never }))
    on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
    on('session.messages', () => ({ value: messages as never }))
    on('prompt.fill', (_$, e) => {
      filled.push(e.text)
      return { isFilled: true }
    })
    on('turn.complete', () => ({ text: '' }) as never)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
    // The engine draws nothing of its own in the band.
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })

    await $.session.start({ cwd: '/repo', surface, isInteractive: true })
    const quiet = await $.ui.mount({ plugin: 'handoff-slice', surface, component: 'AbovePrompt', props: BAND } as never)
    expect(await quiet.find({ key: 'slice-now' })).toBeUndefined()

    tokens = 210_000
    await $.turn.complete({ answer: '' } as never)
    const band = await $.ui.mount({ plugin: 'handoff-slice', surface, component: 'AbovePrompt', props: BAND } as never)
    expect(await band.find({ text: /210k context · a fresh session pays off after ~7 more turns/ })).toBeDefined()

    await band.press({ key: 'slice-now' })
    expect(filled).toEqual(['/handoff-slice:create '])

    await band.press({ key: 'slice-dismiss' })
    expect(await band.find({ key: 'slice-now' })).toBeUndefined()

    tokens = 310_000
    await $.turn.complete({ answer: '' } as never)
    expect(await band.find({ text: /310k context/ })).toBeDefined()

    // /clear drops the old size and the dismiss with it.
    await band.press({ key: 'slice-dismiss' })
    await $.session.end({ reason: 'clear', sessionId: 's', resume: {} } as never)
    expect(await band.find({ key: 'slice-now' })).toBeUndefined()
    await $.turn.complete({ answer: '' } as never)
    expect(await band.find({ key: 'slice-now' })).toBeDefined()

    // A loaded slice is updated in place instead of cut anew.
    messages = [{
      role: 'user',
      text: '<command-name>/handoff-slice:load</command-name>\n<command-message>handoff-slice:load</command-message>\n<command-args>89eb740d</command-args>',
      toolUses: [],
    }]
    await $.turn.complete({ answer: '' } as never)
    expect(await band.find({ text: 'Update slice' })).toBeDefined()
    await band.press({ key: 'slice-now' })
    expect(filled.at(-1)).toBe('/handoff-slice:update 89eb740d')

    // So is an issue the model loaded through the skill, by URL.
    messages.push({ role: 'assistant', text: '', toolUses: [{ tool: 'Skill', input: { skill: 'handoff-slice:issue-load', args: 'https://github.com/o/r/issues/12' } }] })
    await $.turn.complete({ answer: '' } as never)
    await band.press({ key: 'slice-now' })
    expect(filled.at(-1)).toBe('/handoff-slice:issue-update 12')
  })
}
