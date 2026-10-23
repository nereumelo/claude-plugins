import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'tool-log',
  component: 'Pane',
  requestId: 'tool-log',
  props: { title: 'Tool log', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('the pane groups calls by turn and shows the header', async ($, on) => {
  on('command.register', () => ({ value: { command: 'tool-log' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ text: e.text, turnId: e.turnId }))
  on('clock.now', () => ({ value: 1000 }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'faça algo', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /1 calls/ }))?.text).toMatch(/1 calls/)
  expect((await ui.find({ type: 'Text', text: /faça algo/ }))?.text).toMatch(/faça algo/)
  await ui.unmount()
})

test('an empty log says so', async ($) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Nenhuma chamada/ }))?.text).toMatch(/Nenhuma chamada/)
  await ui.unmount()
})
