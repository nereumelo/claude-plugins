export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Info = { model: string; limits: Limit[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { info: Info }
  }
}
