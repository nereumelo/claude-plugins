import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Info, Limit } from '../types'

const info = atom({ plugin: 'usage-band', key: 'info' } as const, {
  model: '',
  limits: [],
} as Info)

const WIDTH = 12

// claude-sonnet-5-5 -> Sonnet 5.5, claude-opus-4-1-20250805 -> Opus 4.1
const prettyModel = (id: string) => {
  const m = id.replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/\[.*\]$/, '')
  const parts = m.split('-')
  const name = parts.filter(p => !/^\d+$/.test(p)).map(p => p[0].toUpperCase() + p.slice(1))
  const ver = parts.filter(p => /^\d+$/.test(p)).join('.')
  return [...name, ver].filter(Boolean).join(' ') || id
}

const bar = (pct: number) => {
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
    const [model, usage] = await Promise.all([$.session.model(), $.session.usage()])
    await update($, info, () => ({ model, limits: usage.rateLimits }))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const model = await $.session.model()
    await update($, info, () => ({ model, limits: e.rateLimits }))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { model, limits } = await read($, info)

    if (e.props.hasSurvey || model === '') {
      return next(e)
    }

    const now = await $.clock.now()
    const { Box, Text } = $.ui.resolve(e)

    const meter = (label: string, l: Limit | undefined) => {
      if (!l) {
        return (
          <Text dimColor>
            {label} –
          </Text>
        )
      }
      const color = tone(l.percentUsed)
      const reset = until(l.resetsAt, now)
      return (
        <Text>
          <Text dimColor>{label} </Text>
          <Text color={color}>{'━'.repeat(bar(l.percentUsed)[0])}</Text>
          <Text dimColor>{'╌'.repeat(bar(l.percentUsed)[1])}</Text>
          <Text color={color} bold>
            {' '}
            {String(Math.round(l.percentUsed)).padStart(3)}%
          </Text>
          {reset ? <Text dimColor> · resets in {reset}</Text> : null}
        </Text>
      )
    }

    return (
      <Box>
        <Text color="cyan" bold>
          {prettyModel(model)}
        </Text>
        <Text dimColor>   ·   </Text>
        {meter('session', limits.find(l => l.kind === 'five_hour'))}
        <Text dimColor>   ·   </Text>
        {meter('weekly', limits.find(l => l.kind === 'seven_day'))}
      </Box>
    )
  })
}
