export type Call = { id: string; tool: string; startedAt: number; ms: number | null }

declare module 'claude-code' {
  interface PluginState {
    'tool-log': { calls: Shaped<Call[]> }
  }
}
