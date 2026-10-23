import { atom, read, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'

import type { Limit } from '../types'

// Faixa única: cada mod entrega um segmento (Box com key `seg-<rank>`) e o
// compõe com os segmentos que já vieram de baixo, ordenado por rank, então a
// ordem de carga dos mods não importa.
type Node = { type?: string; props?: { key?: string; children?: unknown } }
const kids = (n: Node | undefined): Node[] => {
  const c = n?.props?.children
  return (Array.isArray(c) ? c.flat() : c ? [c]  : []) as Node[]
}
const segmentsOf = (below: unknown): Node[] =>
  kids(below as Node).filter(k => k.props?.key?.startsWith('seg-'))
const rankOf = (n: Node) => Number(n.props?.key?.slice(4) ?? 0)

const limitsAtom = atom({ plugin: 'usage-band', key: 'limits' } as const, [] as Limit[])

const WIDTH = 12

const split = (pct: number) => {
  const filled = Math.max(0, Math.min(WIDTH, Math.round((pct / 100) * WIDTH)))
  return [filled, WIDTH - filled] as const
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

    const meter = (label: string, l: Limit | undefined) => {
      if (!l) {
        return <Text dimColor>{label} –</Text>
      }
      const color = tone(l.percentUsed)
      const [full, rest] = split(l.percentUsed)
      const reset = until(l.resetsAt, now)
      return (
        <Text>
          <Text dimColor>{label} </Text>
          <Text color={color}>{'━'.repeat(full)}</Text>
          <Text dimColor>{'╌'.repeat(rest)}</Text>
          <Text color={color} bold>
            {' '}
            {String(Math.round(l.percentUsed)).padStart(3)}%
          </Text>
          {reset ? <Text dimColor> · resets in {reset}</Text> : null}
        </Text>
      )
    }

    const mine = (
      <Text>
        {meter('session', limits.find(l => l.kind === 'five_hour'))}
        <Text dimColor>   ·   </Text>
        {meter('weekly', limits.find(l => l.kind === 'seven_day'))}
      </Text>
    )

    const seg = <Box key="seg-20">{mine}</Box>
    const segs = [...segmentsOf(below), seg as Node].sort((a, b) => rankOf(a) - rankOf(b)) as unknown as RenderElement[]

    return (
      <Box key="band">
        {segs.flatMap((s, i) => (i === 0 ? [s] : [<Text dimColor>{'   ·   '}</Text>, s]))}
      </Box>
    )
  })
}
