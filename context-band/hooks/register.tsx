import { atom, read, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'

// Layout adaptável pela largura da faixa (e.props.bodyColumns); os três mods
// usam os mesmos cortes, então a faixa inteira muda de nível junto:
// 0 completo, 1 sem reset, 2 barra curta, 3 sem barra, 4 rótulos curtos.
const levelOf = (cols?: number) => {
  const c = cols ?? 200
  return c >= 104 ? 0 : c >= 88 ? 1 : c >= 78 ? 2 : c >= 60 ? 3 : 4
}
const BAR: number[] = [8, 8, 5, 0, 0]
const sepOf = (level: number) => (level >= 3 ? ' · ' : '  ·  ')

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

const split = (pct: number, width: number) => {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return [filled, width - filled] as const
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
    const pct = (await read($, percentAtom)) ?? 0

    if (e.props.hasSurvey) {
      return below
    }

    const level = levelOf(e.props.bodyColumns)
    const { Box, Text } = $.ui.resolve(e)
    const color = tone(pct)
    const label = level === 4 ? 'ctx' : 'context'
    const [full, rest] = split(pct, (BAR[level] ?? 0))
    const mine =
      level >= 3 ? (
        <Text>
          <Text dimColor>{label} </Text>
          <Text color={color} bold>
            {Math.round(pct)}%
          </Text>
        </Text>
      ) : (
        <Text>
          <Text dimColor>{label} </Text>
          <Text backgroundColor={color}>{' '.repeat(full)}</Text>
          <Text backgroundColor="#3b4048">{' '.repeat(rest)}</Text>
          <Text color={color} bold>
            {' '}
            {String(Math.round(pct)).padStart(3)}%
          </Text>
        </Text>
      )

    const seg = <Box key="seg-20" flexShrink={0}>{mine}</Box>
    const segs = [...segmentsOf(below), seg as Node].sort((a, b) => rankOf(a) - rankOf(b)) as unknown as RenderElement[]

    return (
      <Box key="band">
        {segs.flatMap((s, i) => (i === 0 ? [s] : [<Text dimColor>{sepOf(level)}</Text>, s]))}
      </Box>
    )
  })
}
