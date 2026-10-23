import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Call, Filter, Status, Turn } from '../types'

const PANE = 'tool-log'
// Muda a tag quando os campos mudam: o valor guardado por uma versão anterior
// é lido como o inicial.
const calls = atom({ plugin: 'tool-log', key: 'calls' } as const, [], { shape: 'calls-4' })
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
// Não são trabalho: o Agent volta na hora (o tempo real é o dos filhos) e o hand-back é só o relatório.
const HANDBACK = 'SubagentHandback'
const isWork = (c: Call) => c.ms !== null && !WAITS.has(c.tool) && c.tool !== 'Agent' && c.tool !== HANDBACK
const KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description', 'skill', 'prompt']

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
  c.ms === null || WAITS.has(c.tool) || c.tool === 'Agent' ? undefined : c.ms >= 30000 ? 'red' : c.ms >= 10000 ? 'yellow' : undefined

export const register: Register = on => {
  // Quando o engine liberou a chamada (permissão decidida): o tempo da fila e do
  // classificador não conta como duração da ferramenta. Perdido num reload, cai
  // para o início do tool.call.
  const readyAt = new Map<string, number>()

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id !== undefined) readyAt.set(e.tool_use_id, await $.clock.now())

    return verdict
  })

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
      startedAt,
      ...(e.agentId !== undefined ? { agentId: e.agentId } : {}),
    }
    await update($, calls, list => [...list, call].slice(-200))
    const ran = await next(e)
    const ms = (await $.clock.now()) - (readyAt.get(id) ?? startedAt)
    readyAt.delete(id)
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

    const visible = list.filter(c => c.tool !== HANDBACK)
    const work = list.filter(isWork)
    const total = work.reduce((n, c) => n + (c.ms ?? 0), 0)
    const slow = work.reduce<Call | undefined>((a, c) => (!a || (c.ms ?? 0) > (a.ms ?? 0) ? c : a), undefined)
    const tools = [...new Set(visible.map(c => c.tool))].sort()

    const passes = (c: Call) =>
      (f === 'all' || (f === 'errors' && (c.status === 'error' || c.status === 'denied')) || (f === 'slow' && (c.ms ?? 0) >= SLOW_MS)) &&
      (tf === '' || c.tool === tf)
    const isFiltered = f !== 'all' || tf !== ''

    const turnIds = [...groups.map(g => g.id), ...(list.some(c => c.turn === NO_TURN) ? [NO_TURN] : [])].reverse()
    const lastId = groups.at(-1)?.id ?? NO_TURN
    const toolW = Math.min(10, Math.max(4, ...visible.map(c => c.tool.length)))

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

    // Liga cada subagente (as chamadas com o mesmo agentId) ao Agent que o disparou:
    // o último Agent livre iniciado antes da primeira chamada do subagente.
    const treeOf = (mine: Call[]) => {
      const tops = mine.filter(c => c.agentId === undefined)
      const byAgent = new Map<string, Call[]>()
      for (const c of mine) {
        if (c.agentId !== undefined) byAgent.set(c.agentId, [...(byAgent.get(c.agentId) ?? []), c])
      }
      const free = tops.filter(c => c.tool === 'Agent')
      const kids = new Map<string, Call[]>()
      const orphans: Call[] = []
      for (const g of [...byAgent.values()].sort((x, y) => (x[0]?.startedAt ?? 0) - (y[0]?.startedAt ?? 0))) {
        const parent = free.filter(a => a.startedAt <= (g[0]?.startedAt ?? 0)).at(-1)
        if (parent) {
          kids.set(parent.id, g)
          free.splice(free.indexOf(parent), 1)
        } else {
          orphans.push(...g)
        }
      }
      return { tops: [...tops, ...orphans].sort((x, y) => x.startedAt - y.startedAt), kids }
    }

    let shownCount = 0

    const turnBlocks = turnIds.map(id => {
      const mine = list.filter(c => c.turn === id)
      if (mine.length === 0) return null
      const { tops, kids } = treeOf(mine)

      // O Agent volta na hora: o tempo dele é o do subagente, até o hand-back.
      const effective = (c: Call): Call => {
        const g = kids.get(c.id)
        if (c.tool !== 'Agent' || !g) return c
        const back = g.find(k => k.tool === HANDBACK)
        const end = back && back.ms !== null ? back.startedAt + back.ms : null
        return end === null ? { ...c, ms: null, status: 'run' } : { ...c, ms: end - c.startedAt, status: c.status === 'run' ? 'ok' : c.status }
      }

      const rows: { c: Call; child: boolean; warn: boolean }[] = []
      for (const top of tops.slice().reverse()) {
        const eff = effective(top)
        const sub = (kids.get(top.id) ?? []).filter(k => k.tool !== HANDBACK)
        const subShown = sub.filter(passes)
        if (!isFiltered || passes(eff) || subShown.length > 0) {
          rows.push({ c: eff, child: top.agentId !== undefined, warn: eff.tool === 'Agent' && eff.status === 'ok' && sub.some(k => k.status === 'error') })
          for (const k of isFiltered ? subShown : sub) rows.push({ c: k, child: true, warn: false })
        }
      }
      if (rows.length === 0) return null
      shownCount += rows.length

      const isOpen = flips[id] ?? id === lastId
      const title = id === NO_TURN ? 'chamadas anteriores' : `“${groups.find(g => g.id === id)?.text ?? ''}”`
      const mineVisible = mine.filter(c => c.tool !== HANDBACK)
      const sub = `${mineVisible.length} calls · ${fmt(mine.filter(isWork).reduce((n, c) => n + (c.ms ?? 0), 0))}`
      const peak = Math.max(1, ...mine.filter(isWork).map(c => c.ms ?? 0))
      const head = cut(title, Math.max(8, cols - sub.length - 8))

      return (
        <Box flexDirection="column">
          <Button key={`t-${id || 'none'}`} plain onPress={() => toggle(id)}>
            <Text bold>{isOpen ? '▾' : '▸'} </Text>
            <Text bold>{head}</Text>
            <Text dimColor>{'  '}{sub}</Text>
          </Button>
          {isOpen &&
            rows.map(({ c, child, warn }) => {
              const indent = child ? '    └ ' : '  '
              const fixed = indent.length + 1 + 1 + toolW + 1 + (barW > 0 ? barW + 1 : 0) + timeW
              const sumW = hasSummary ? Math.max(0, cols - fixed - 1) : 0
              const w = !isWork(c) || (c.ms ?? 0) < 1000 ? 0 : Math.max(1, Math.round(((c.ms ?? 0) / peak) * barW))
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
                    {warn ? <Text color="yellow">!</Text> : icon(c)}
                    <Text color="cyan"> {cut(c.tool, toolW).padEnd(toolW)}</Text>
                    {hasSummary ? <Text dimColor> {cutSmart(c.summary, sumW).padEnd(sumW)}</Text> : null}
                    {barW > 0 ? (
                      <Text>
                        {' '}
                        <Text backgroundColor={color ?? 'green'}>{' '.repeat(w)}</Text>
                        {' '.repeat(Math.max(0, barW - w))}
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
          {visible.length} calls
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
        {isFiltered ? (
          <Text dimColor>
            filtro: {[f !== 'all' ? (f === 'errors' ? 'erros' : 'lentas') : '', tf].filter(Boolean).join(' · ')} · {shownCount} de {visible.length}
          </Text>
        ) : null}
        <Text> </Text>
        {turnBlocks.every(b => b === null) && <Text dimColor>Nenhuma chamada{f !== 'all' || tf !== '' ? ' neste filtro' : ' ainda'}.</Text>}
        {turnBlocks.filter(b => b !== null).flatMap((b, i) => (i === 0 ? [b] : [<Text> </Text>, b]))}
      </Box>
    )
  })
}
