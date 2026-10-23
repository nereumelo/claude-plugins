import { atom, read, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'

import type { Limit } from '../types'

// Faixa única: cada mod entrega um segmento (Box com key `seg-<rank>`) e o
// compõe com os segmentos que já vieram de baixo, ordenado por rank, então a
// ordem de carga dos mods não importa.
type Node = { type?: string; props?: { key?: string }; children?: unknown }
// Layout adaptável pela largura da faixa (e.props.bodyColumns); os três mods
// usam os mesmos cortes, então a faixa inteira muda de nível junto:
// 0 completo, 1 sem reset, 2 barra curta, 3 sem barra, 4 rótulos curtos.
const levelOf = (cols?: number) => {
  const c = cols ?? 200
  return c >= 104 ? 0 : c >= 88 ? 1 : c >= 78 ? 2 : c >= 60 ? 3 : 4
}
const BAR: number[] = [8, 8, 5, 0, 0]
const sepOf = (level: number) => (level >= 3 ? ' · ' : '  ·  ')

const kids = (n: Node | undefined): Node[] => {
  const c = n?.children
  return (Array.isArray(c) ? c.flat() : c ? [c] : []) as Node[]
}
const segmentsOf = (below: unknown): Node[] =>
  kids(below as Node).filter(k => k.props?.key?.startsWith('seg-'))
const rankOf = (n: Node) => Number(n.props?.key?.slice(4) ?? 0)

const limitsAtom = atom({ plugin: 'usage-band', key: 'limits' } as const, [] as Limit[])

const split = (pct: number, width: number) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return [filled, width - filled] as const
}

const tone = (pct: number) => (pct >= 90 ? 'red' : pct >= 70 ? 'yellow' : 'green')

const until = (iso: string | undefined, now: number) => {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((Date.parse(iso) - now) / 60000))
  if (mins >= 1440) return `${Math.floor(mins / 1440)}d${Math.floor((mins % 1440) / 60)}h`
  if (mins >= 60) return `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}m`
  return `${mins}m`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, limitsAtom, () => usage.rateLimits)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, limitsAtom, () => e.rateLimits)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const limits = await read($, limitsAtom)

    if (e.props.hasSurvey || limits.length === 0) {
      return below
    }

    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    const level = levelOf(e.props.bodyColumns)
    const meter = (label: string, short: string, l: Limit | undefined) => {
      if (!l) {
        return <Text dimColor>{level === 4 ? short : label} –</Text>
      }
      const color = tone(l.percentUsed)
      const pct = Math.round(l.percentUsed)
      const reset = until(l.resetsAt, now)
      if (level >= 3) {
        return (
          <Text>
            <Text dimColor>{level === 4 ? short : label} </Text>
            <Text color={color} bold>
              {pct}%
            </Text>
          </Text>
        )
      }
      const [full, rest] = split(l.percentUsed, (BAR[level] ?? 0))
      return (
        <Text>
          <Text dimColor>{label} </Text>
          <Text backgroundColor={color}>{' '.repeat(full)}</Text>
          <Text backgroundColor="#3b4048">{' '.repeat(rest)}</Text>
          <Text color={color} bold>
            {' '}
            {String(pct).padStart(3)}%
          </Text>
          {level === 0 && reset ? <Text dimColor>  {reset}</Text> : null}
        </Text>
      )
    }

    const mine = (
      <Text>
        {meter('session', '5h', limits.find(l => l.kind === 'five_hour'))}
        <Text dimColor>{sepOf(level)}</Text>
        {meter('weekly', '7d', limits.find(l => l.kind === 'seven_day'))}
      </Text>
    )

    const seg = <Box key="seg-30" flexShrink={0}>{mine}</Box>
    const segs = [...segmentsOf(below), seg as Node].sort((a, b) => rankOf(a) - rankOf(b)) as unknown as RenderElement[]

    return (
      <Box key="band">
        {segs.flatMap((s, i) => (i === 0 ? [s] : [<Text dimColor>{sepOf(level)}</Text>, s]))}
      </Box>
    )
  })
}
