declare module 'claude-code' {
  interface PluginState {
    'model-band': { model: string; agents: Record<string, string> }
  }
}
