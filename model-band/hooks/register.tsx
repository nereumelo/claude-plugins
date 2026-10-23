import { atom, read, update } from 'claude-code'
import type { Register, RenderElement } from 'claude-code'

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

const model = atom({ plugin: 'model-band', key: 'model' } as const, '')

// claude-sonnet-5-5 -> Sonnet 5.5, claude-opus-4-1-20250805 -> Opus 4.1
const prettyModel = (id: string) => {
  const m = id.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[.*\]$/, '')
  const parts = m.split('-')
  const name = parts.filter(p => !/^\d+$/.test(p)).map(p => p.charAt(0).toUpperCase() + p.slice(1))
  const ver = parts.filter(p => /^\d+$/.test(p)).join('.')
  return [...name, ver].filter(Boolean).join(' ') || id
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const id = await $.session.model()
    await update($, model, () => id)

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const id = await $.session.model()
    await update($, model, () => id)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const id = await read($, model)

    if (e.props.hasSurvey || id === '') {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    const mine = (
      <Text color="cyan" bold>
        {prettyModel(id)}
      </Text>
    )

    const seg = <Box key="seg-10" flexShrink={0}>{mine}</Box>
    const segs = [...segmentsOf(below), seg as Node].sort((a, b) => rankOf(a) - rankOf(b)) as unknown as RenderElement[]

    return (
      <Box key="band">
        {segs.flatMap((s, i) => (i === 0 ? [s] : [<Text dimColor>{'  ·  '}</Text>, s]))}
      </Box>
    )
  })
}
