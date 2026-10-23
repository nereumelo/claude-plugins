import { atom, read, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'

const percentAtom = atom({ plugin: 'context-band', key: 'percent' } as const, null as number | null)

// Faixa única: cada mod entrega um segmento (Box com key `seg-<rank>`) e o
// compõe com os segmentos que já vieram de baixo, ordenado por rank, então a
// ordem de carga dos mods não importa.
type Node = { type?: string; props?: { key?: string }; children?: unknown }
const kids = (n: Node | undefined): Node[] => {
  const c = n?.children
  return (Array.isArray(c) ? c.flat() : c ? [c] : []) as Node[]
}
const segmentsOf = (below: unknown): Node[] =>
  kids(below as Node).filter(k => k.props?.key?.startsWith('seg-'))
const rankOf = (n: Node) => Number(n.props?.key?.slice(4) ?? 0)

const WIDTH = 12

const split = (pct: number) => {
  const filled = Math.max(0, Math.min(WIDTH, Math.round((pct / 100) * WIDTH)))
  return [filled, WIDTH - filled] as const
}

const tone = (pct: number) => (pct >= 90 ? 'red' : pct >= 70 ? 'yellow' : 'green')

export const register: Register = on => {
  let warned = 0

  on('session.start', async ($, e, next) => {
    const { context } = await $.session.usage()
    await update($, percentAtom, () => context.percent ?? null)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const pct = e.context.percent ?? null
    await update($, percentAtom, () => pct)

    const level = pct === null ? 0 : pct >= 90 ? 90 : pct >= 80 ? 80 : 0
    if (level > warned) {
      $.ui.toast(`Contexto em ${Math.round(pct ?? 0)}%`)
    }
    warned = level

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const pct = await read($, percentAtom)

    if (e.props.hasSurvey || pct === null) {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    const color = tone(pct)
    const [full, rest] = split(pct)
    const mine = (
      <Text>
        <Text dimColor>context </Text>
        <Text color={color}>{'━'.repeat(full)}</Text>
        <Text dimColor>{'╌'.repeat(rest)}</Text>
        <Text color={color} bold>
          {' '}
          {String(Math.round(pct)).padStart(3)}%
        </Text>
      </Text>
    )

    const seg = <Box key="seg-30">{mine}</Box>
    const segs = [...segmentsOf(below), seg as Node].sort((a, b) => rankOf(a) - rankOf(b)) as unknown as RenderElement[]

    return (
      <Box key="band">
        {segs.flatMap((s, i) => (i === 0 ? [s] : [<Text dimColor>{'   ·   '}</Text>, s]))}
      </Box>
    )
  })
}
