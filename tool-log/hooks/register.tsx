import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Call, Filter, Status, Turn } from '../types'

const PANE = 'tool-log'
// Muda a tag quando os campos mudam: o valor guardado por uma versão anterior
// é lido como o inicial.
const calls = atom({ plugin: 'tool-log', key: 'calls' } as const, [], { shape: 'calls-3' })
const turns = atom({ plugin: 'tool-log', key: 'turns' } as const, [], { shape: 'turns-1' })
const filter = atom({ plugin: 'tool-log', key: 'filter' } as const, 'all' as Filter)
const toolFilter = atom({ plugin: 'tool-log', key: 'toolFilter' } as const, '')
const toggled = atom({ plugin: 'tool-log', key: 'toggled' } as const, {} as Record<string, boolean>)
const expanded = atom({ plugin: 'tool-log', key: 'expanded' } as const, [] as string[])
const isPaused = atom({ plugin: 'tool-log', key: 'isPaused' } as const, false)

const NO_TURN = ''
const SLOW_MS = 5000
// Ferramentas em que o tempo é de espera do usuário, não de trabalho.
const WAITS = new Set(['AskUserQuestion', 'ExitPlanMode', 'EnterPlanMode'])
const KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'skill', 'prompt']
const TRACK = '#3b4048'

const field = (input: Record<string, unknown>) => {
  for (const k of KEYS) {
    const v = input[k]
    if (typeof v === 'string' && v.trim() !== '') return v
  }
  return ''
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

const fmt = (ms: number) =>
  ms < 1000
    ? `${ms}ms`
    : ms < 60000
      ? `${(ms / 1000).toFixed(1)}s`
      : `${Math.floor(ms / 60000)}m${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}s`

const cut = (s: string, n: number) =>
  n <= 0 ? '' : s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`

// Caminhos perdem o começo, não o fim: o nome do arquivo é o que importa.
const cutSmart = (s: string, n: number) =>
  n > 0 && s.length > n && /^[~/.]/.test(s) && !s.includes(' ') ? `…${s.slice(-(n - 1))}` : cut(s, n)

const wrap = (s: string, n: number) => {
  const out: string[] = []
  for (const line of s.split('\n')) {
    for (let i = 0; i < Math.max(line.length, 1); i += Math.max(n, 10)) out.push(line.slice(i, i + Math.max(n, 10)))
  }
  return out.slice(0, 12)
}

const timeTone = (c: Call) =>
  c.ms === null || WAITS.has(c.tool) ? undefined : c.ms >= 30000 ? 'red' : c.ms >= 10000 ? 'yellow' : undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tool-log',
      description: 'Painel com as chamadas de ferramenta, agrupadas por turno, e o tempo de cada uma',
    })

    return next(e)
  })

  on('command.run', { command: 'tool-log' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Tool log' })

    return { text: 'Painel tool-log aberto.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined && !(await read($, isPaused))) {
      const turn: Turn = { id: e.turnId, text: oneLine(e.text).slice(0, 200) }
      await update($, turns, list => [...list, turn].slice(-50))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (await read($, isPaused)) {
      return next(e)
    }

    const startedAt = await $.clock.now()
    const id = e.tool_use_id
    const all = await read($, turns)
    const full = field(e as unknown as Record<string, unknown>)
    const call: Call = {
      id,
      tool: e.tool,
      summary: oneLine(full),
      full: full.slice(0, 2000),
      ms: null,
      status: 'run',
      turn: all.at(-1)?.id ?? NO_TURN,
      ...(e.agentId !== undefined ? { agentId: e.agentId } : {}),
    }
    await update($, calls, list => [...list, call].slice(-200))
    const ran = await next(e)
    const ms = (await $.clock.now()) - startedAt
    const status: Status = ran.deny !== undefined ? 'denied' : ran.isError === true ? 'error' : 'ok'
    await update($, calls, list => list.map(c => (c.id === id ? { ...c, ms, status } : c)))

    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, calls)
    const groups = await read($, turns)
    const f = await read($, filter)
    const tf = await read($, toolFilter)
    const flips = await read($, toggled)
    const open = await read($, expanded)
    const paused = await read($, isPaused)
    const cols = e.props.bodyColumns ?? 60

    const barW = cols >= 76 ? 10 : cols >= 48 ? 6 : 0
    const hasSummary = cols >= 40
    const timeW = 6

    const work = list.filter(c => c.ms !== null && !WAITS.has(c.tool))
    const total = work.reduce((n, c) => n + (c.ms ?? 0), 0)
    const slow = work.reduce<Call | undefined>((a, c) => (!a || (c.ms ?? 0) > (a.ms ?? 0) ? c : a), undefined)
    const tools = [...new Set(list.map(c => c.tool))].sort()

    const passes = (c: Call) =>
      (f === 'all' || (f === 'errors' && (c.status === 'error' || c.status === 'denied')) || (f === 'slow' && (c.ms ?? 0) >= SLOW_MS)) &&
      (tf === '' || c.tool === tf)

    const turnIds = [...groups.map(g => g.id), ...(list.some(c => c.turn === NO_TURN) ? [NO_TURN] : [])].reverse()
    const lastId = groups.at(-1)?.id ?? NO_TURN
    const toolW = Math.min(14, Math.max(4, ...list.map(c => c.tool.length)))

    const icon = (c: Call) =>
      c.status === 'run' ? (
        <Text color="yellow">…</Text>
      ) : c.status === 'ok' ? (
        <Text color="green">✓</Text>
      ) : (
        <Text color="red">{c.status === 'denied' ? '⊘' : '✗'}</Text>
      )

    const toggle = (id: string) => update($, toggled, t => ({ ...t, [id]: !(t[id] ?? id === lastId) }))
    const mark = (isOn: boolean, label: string) =>
      isOn ? (
        <Text color="cyan" bold>
          {label}
        </Text>
      ) : (
        <Text dimColor>{label}</Text>
      )

    const turnBlocks = turnIds.map(id => {
      const mine = list.filter(c => c.turn === id)
      const shown = mine.filter(passes)
      if (shown.length === 0 && (f !== 'all' || tf !== '')) return null
      if (mine.length === 0) return null
      const isOpen = flips[id] ?? id === lastId
      const title = id === NO_TURN ? 'chamadas anteriores' : `“${groups.find(g => g.id === id)?.text ?? ''}”`
      const mineWork = mine.filter(c => c.ms !== null && !WAITS.has(c.tool))
      const sub = `${mine.length} calls · ${fmt(mineWork.reduce((n, c) => n + (c.ms ?? 0), 0))}`
      const peak = Math.max(1, ...mineWork.map(c => c.ms ?? 0))
      const head = cut(title, Math.max(8, cols - sub.length - 8))

      return (
        <Box flexDirection="column">
          <Button key={`t-${id || 'none'}`} plain onPress={() => toggle(id)}>
            <Text bold>{isOpen ? '▾' : '▸'} </Text>
            <Text bold>{head}</Text>
            <Text dimColor>{'  '}{sub}</Text>
          </Button>
          {isOpen &&
            shown
              .slice()
              .reverse()
              .map(c => {
                const sub1 = c.agentId !== undefined
                const indent = sub1 ? '    └ ' : '  '
                const fixed = indent.length + 1 + 1 + toolW + 1 + (barW > 0 ? barW + 1 : 0) + timeW
                const sumW = hasSummary ? Math.max(0, cols - fixed - 1) : 0
                const wait = WAITS.has(c.tool)
                const w = c.ms === null || wait ? 0 : Math.max(1, Math.round((c.ms / peak) * barW))
                const color = timeTone(c)
                const isOn = open.includes(c.id)

                return (
                  <Box flexDirection="column">
                    <Button
                      key={`c-${c.id}`}
                      plain
                      onPress={() => update($, expanded, l => (l.includes(c.id) ? l.filter(x => x !== c.id) : [...l, c.id]))}
                    >
                      <Text dimColor>{indent}</Text>
                      {icon(c)}
                      <Text color="cyan"> {cut(c.tool, toolW).padEnd(toolW)}</Text>
                      {hasSummary ? <Text dimColor> {cutSmart(c.summary, sumW).padEnd(sumW)}</Text> : null}
                      {barW > 0 ? (
                        <Text>
                          {' '}
                          <Text backgroundColor={color ?? 'green'}>{' '.repeat(w)}</Text>
                          <Text backgroundColor={TRACK}>{' '.repeat(Math.max(0, barW - w))}</Text>
                        </Text>
                      ) : null}
                      <Text color={color} dimColor={color === undefined}>
                        {(c.ms === null ? '' : fmt(c.ms)).padStart(timeW)}
                      </Text>
                    </Button>
                    {isOn &&
                      wrap(c.full || '(sem entrada)', cols - indent.length - 2).map(line => (
                        <Text dimColor>
                          {indent}│ {line}
                        </Text>
                      ))}
                  </Box>
                )
              })}
        </Box>
      )
    })

    return (
      <Box flexDirection="column">
        <Text bold>
          {list.length} calls
          <Text dimColor>
            {' '}
            · {fmt(total)} working{slow ? ` · slowest ${slow.tool} ${fmt(slow.ms ?? 0)}` : ''}
          </Text>
        </Text>
        <Box flexWrap="wrap" columnGap={2}>
          <Button key="a-errors" plain hotkey="e" onPress={() => update($, filter, x => (x === 'errors' ? 'all' : 'errors'))}>
            {mark(f === 'errors', 'erros')}
          </Button>
          <Button key="a-slow" plain hotkey="l" onPress={() => update($, filter, x => (x === 'slow' ? 'all' : 'slow'))}>
            {mark(f === 'slow', 'lentas')}
          </Button>
          <Button
            key="a-tool"
            plain
            hotkey="t"
            onPress={() =>
              update($, toolFilter, cur => {
                const ring = ['', ...tools]
                return ring[(ring.indexOf(cur) + 1) % ring.length] ?? ''
              })
            }
          >
            {mark(tf !== '', tf === '' ? 'ferramenta' : tf)}
          </Button>
          <Button key="a-pause" plain hotkey="p" onPress={() => update($, isPaused, x => !x)}>
            {mark(paused, paused ? 'pausado' : 'pausar')}
          </Button>
          <Button
            key="a-clear"
            plain
            hotkey="c"
            onPress={async () => {
              await update($, calls, () => [])
              await update($, turns, () => [])
              await update($, expanded, () => [])
            }}
          >
            <Text dimColor>limpar</Text>
          </Button>
        </Box>
        <Text> </Text>
        {turnBlocks.every(b => b === null) && <Text dimColor>Nenhuma chamada{f !== 'all' || tf !== '' ? ' neste filtro' : ' ainda'}.</Text>}
        {turnBlocks}
      </Box>
    )
  })
}
