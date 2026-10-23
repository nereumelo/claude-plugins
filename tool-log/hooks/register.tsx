import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Call } from '../types'

const PANE = 'tool-log'
// Muda a tag quando os campos de Call mudam: o valor guardado de uma versão
// anterior é lido como o inicial.
const calls = atom({ plugin: 'tool-log', key: 'calls' } as const, [], { shape: 'calls-2' })

// Ferramentas em que o tempo é de espera do usuário, não de trabalho.
const WAITS = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode'])
const KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'skill', 'prompt']

const summarize = (input: Record<string, unknown>) => {
  for (const k of KEYS) {
    const v = input[k]
    if (typeof v === 'string' && v.trim() !== '') return v.replace(/\s+/g, ' ').trim()
  }
  return ''
}

const fmt = (ms: number) =>
  ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`

const cut = (s: string, n: number) => (n <= 0 ? '' : s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`)

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
    const summary = summarize(e as unknown as Record<string, unknown>)
    await update($, calls, list => [...list, { id, tool: e.tool, summary, ms: null, status: 'run' } as Call].slice(-200))
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt
    const status: Call['status'] = ran.deny !== undefined ? 'denied' : ran.isError === true ? 'error' : 'ok'
    await update($, calls, list => list.map(c => (c.id === id ? { ...c, ms, status } : c)))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, calls)
    const cols = e.props.bodyColumns ?? 60
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6)

    const work = list.filter(c => c.ms !== null && !WAITS.has(c.tool))
    const total = work.reduce((n, c) => n + (c.ms ?? 0), 0)
    const slow = work.reduce<Call | undefined>((a, c) => (!a || (c.ms ?? 0) > (a.ms ?? 0) ? c : a), undefined)

    const shown = list.slice(-room).reverse()
    const toolW = Math.min(16, Math.max(4, ...shown.map(c => c.tool.length)))
    const timeW = 6
    const sumW = Math.max(0, cols - 2 - toolW - 1 - 1 - timeW)

    const icon = (c: Call) =>
      c.status === 'run' ? (
        <Text color="yellow">…</Text>
      ) : c.status === 'ok' ? (
        <Text color="green">✓</Text>
      ) : (
        <Text color="red">{c.status === 'denied' ? '⊘' : '✗'}</Text>
      )

    const timeColor = (c: Call) =>
      c.ms === null || WAITS.has(c.tool) ? undefined : c.ms >= 30000 ? 'red' : c.ms >= 10000 ? 'yellow' : undefined

    return (
      <Box flexDirection="column">
        <Text bold>
          {list.length} calls
          <Text dimColor>
            {' '}
            · {fmt(total)} working{slow ? ` · slowest ${slow.tool} ${fmt(slow.ms ?? 0)}` : ''}
          </Text>
        </Text>
        <Text> </Text>
        {shown.length === 0 && <Text dimColor>Nenhuma chamada ainda.</Text>}
        {shown.map(c => (
          <Text key={c.id}>
            {icon(c)}
            <Text color="cyan"> {cut(c.tool, toolW).padEnd(toolW)}</Text>
            <Text dimColor> {cut(c.summary, sumW).padEnd(sumW)} </Text>
            <Text color={timeColor(c)} dimColor={timeColor(c) === undefined}>
              {(c.ms === null ? '' : fmt(c.ms)).padStart(timeW)}
            </Text>
          </Text>
        ))}
      </Box>
    )
  })
}
