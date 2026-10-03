export type Handoff = {
  kind: 'local' | 'issue'
  id: string
  title: string
  status: string
  date: string
  isStale: boolean
}

export type Preview = { kind: 'local' | 'issue'; id: string; title: string; body: string }

// The band's tier is worked out once per turn, so drawing reads no files.
// The slice this conversation already works on: loaded (id known) or created
// here (id null, the update command finds it itself). Null: none yet.
export type SessionSlice = { kind: 'local' | 'issue'; id: string | null }

export type ContextReading = { tokens: number; tier: 0 | 1 | 2 | 3; turns: number; slice: SessionSlice | null }

declare module 'claude-code' {
  interface PluginState {
    'handoff-slice': {
      handoffs: Handoff[]
      issues: Handoff[] | null
      issueNote: string | null
      preview: Preview | null
      top: number
      mode: 'text' | 'markdown'
      page: number
      context: ContextReading | null
      dismissedTier: number
      selected: string | null
    }
  }
}
