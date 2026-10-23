import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Call } from '../types'

const PANE = 'tool-log'
const calls = atom({ plugin: 'tool-log', key: 'calls' } as const, [], { shape: 'calls-1' })

const fmt = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tool-log',
      description: 'Painel com as chamadas de ferramenta e o tempo de cada uma',
    })

    return next(e)
  })

  on('command.run', { command: 'tool-log' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Tool log' })

    return { text: 'Painel tool-log aberto.' }
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const id = e.tool_use_id
    await update($, calls, list => [...list, { id, tool: e.tool, startedAt, ms: null } as Call].slice(-200))
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt
    await update($, calls, list => list.map(c => (c.id === id ? { ...c, ms } : c)))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, calls)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 4)
    const shown = list.slice(-room).reverse()
    const slowest = Math.max(0, ...list.map(c => c.ms ?? 0))

    return (
      <Box flexDirection="column">
        {shown.length === 0 && <Text dimColor>Nenhuma chamada ainda.</Text>}
        {shown.map(c => (
          <Text key={c.id}>
            <Text color={c.ms === null ? 'yellow' : c.ms === slowest && slowest > 0 ? 'red' : 'green'}>
              {c.ms === null ? '…' : '✓'}
            </Text>
            <Text> {c.tool.padEnd(14)}</Text>
            <Text dimColor>{c.ms === null ? 'rodando' : fmt(c.ms)}</Text>
          </Text>
        ))}
      </Box>
    )
  })
}
