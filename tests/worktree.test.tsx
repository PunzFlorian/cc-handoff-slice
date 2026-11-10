import { expect, test } from 'claude-code/testing'

const PANE = { title: 'Handoffs', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

// git worktree list --porcelain, as seen from a linked worktree.
const NORMAL = 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feat\nHEAD def\nbranch refs/heads/feat\n\n'
const BARE = 'worktree /proj.git\nbare\n\nworktree /repo-feat\nHEAD def\nbranch refs/heads/feat\n\n'

const cases = [
  { name: 'a linked worktree reads the main worktree slices', porcelain: NORMAL, config: {}, expected: '/repo/.claude/handoffs' },
  { name: 'a bare repo keeps slices in the repo itself', porcelain: BARE, config: {}, expected: '/proj.git/handoffs' },
  {
    name: 'shareAcrossWorktrees false keeps the worktree own',
    porcelain: NORMAL,
    config: { '/repo-feat/.claude/handoff-slice.json': '{"shareAcrossWorktrees": false}' },
    expected: '/repo-feat/.claude/handoffs',
  },
  {
    name: 'the main worktree config can switch sharing off',
    porcelain: NORMAL,
    config: { '/repo/.claude/handoff-slice.json': '{"shareAcrossWorktrees": false}' },
    expected: '/repo-feat/.claude/handoffs',
  },
] as const

for (const { name, porcelain, config, expected } of cases) {
  test(name, async ($, on) => {
    const files: Record<string, string> = config
    const listed: string[] = []
    on('fs.exists', (_$, e) => ({ value: e.path in files || e.path.endsWith('handoffs') || e.path === '/repo' }))
    on('fs.read', (_$, e) => ({ value: files[e.path] ?? '' }))
    on('fs.list', (_$, e) => {
      listed.push(e.path)
      return { value: [] }
    })
    on('env.get', () => ({ value: undefined }))
    on('clock.now', () => ({ value: 0 }))
    on('process.run', (_$, e) => ({
      value: (e.argv[0] === 'git'
        ? { exitCode: 0, stdout: porcelain, stderr: '' }
        : { exitCode: 1, stdout: '', stderr: 'gh: not logged in' }) as never,
    }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true as const } }))
    on('ui.panes', () => ({ value: [] }))
    on('ui.toast', () => ({ value: undefined }))

    on('session.root', () => ({ value: '/repo-feat' }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/repo-feat', surface: 'terminal', isInteractive: true })
    await $.command.run({ command: 'handoffs', args: '' } as never)
    await $.ui.mount({ plugin: 'handoff-slice', surface: 'terminal', component: 'Pane', requestId: 'handoffs', props: PANE } as never)

    expect(listed.length > 0 && listed.every(path => path === expected)).toBe(true)
  })
}
