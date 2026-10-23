export type Call = {
  id: string
  tool: string
  summary: string
  ms: number | null
  status: 'run' | 'ok' | 'error' | 'denied'
}

declare module 'claude-code' {
  interface PluginState {
    'tool-log': { calls: Shaped<Call[]> }
  }
}
