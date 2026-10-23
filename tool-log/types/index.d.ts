export type Status = 'run' | 'ok' | 'error' | 'denied'
export type Call = {
  id: string
  tool: string
  summary: string
  full: string
  ms: number | null
  status: Status
  turn: string
  startedAt: number
  agentId?: string
}
export type Turn = { id: string; text: string }
export type Filter = 'all' | 'errors' | 'slow'

declare module 'claude-code' {
  interface PluginState {
    'tool-log': {
      calls: Shaped<Call[]>
      turns: Shaped<Turn[]>
      filter: Filter
      toolFilter: string
      toggled: Record<string, boolean>
      expanded: string[]
      isPaused: boolean
    }
  }
}
