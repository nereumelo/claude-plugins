import type { Register } from 'claude-code'

// Limites da conta: a sessão (janela de 5h) e a semana (7d).
const LIMITS: Record<string, number> = { five_hour: 96, seven_day: 98 }
const LABEL: Record<string, string> = { five_hour: 'sessão (5h)', seven_day: 'semanal (7d)' }
const HALT_KEY = 'halt'

type Halt = { reason: string; until: number }
type Phase = 'running' | 'draining' | 'halted'

// Durante o encerramento só passa o que registra estado: leitura, status/roadmap, memo e git de leitura.
const STATUS_FILE = /(^|\/)(STATE|TASKS|ROADMAP|HANDOFF|STATUS)\.md$/i
const SAFE_BASH = /^\s*(memo\s+(note|recall|zoom)\b|git\s+(status|diff|log|branch|rev-parse)\b)/
const SHELL_META = /[;&|`<>]|\$\(/

const wrapUpPrompt = (reason: string, resets: string) => `[usage-guard] Limite de uso quase esgotado (${reason}). A sessão será interrompida: NÃO inicie trabalho novo. Com o uso que resta, faça só o encerramento seguro, nesta ordem e enxuto:
1. \`git status\` e \`git diff --stat\` (somente leitura). NÃO faça commit, push, merge nem rebase; deixe o WIP como está.
2. Se você trabalhava num item de roadmap/issue, atualize só os arquivos de status (app/TASKS.md, app/STATE.md, app/ROADMAP.md, framework/STATE.md ou equivalentes): marque o que foi concluído com evidência curta e registre o que ficou em andamento ("interrompido por limite de uso em ${new Date().toISOString().slice(0, 10)}; próximo passo: ...").
3. Registre a memória com \`memo note "<1 linha, até 280 bytes: o que foi feito, estado do WIP e próximo passo>"\` (sem ; & | < > \` nem $( no texto). Pule este passo se esta for rotina autônoma do loop (vizze-dev, vizze-visual) ou subagente: eles nunca usam memo.
4. Responda em português com no máximo 5 linhas: estado, o que ficou pendente e quando o limite renova (${resets}). Depois disso não chame mais ferramentas.`

export const register: Register = on => {
  let phase: Phase = 'running'
  let isOverridden = false
  let isWrapUp = false
  let mainTurn: string | undefined
  let haltInfo: Halt | undefined

  const fmtUntil = (ms: number) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

  const tripped = (limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): Halt | undefined => {
    for (const l of limits) {
      const max = LIMITS[l.kind]
      if (max !== undefined && l.percentUsed >= max) {
        const until = l.resetsAt ? Date.parse(l.resetsAt) : Date.now() + 60 * 60 * 1000
        return { reason: `${LABEL[l.kind]} em ${Math.round(l.percentUsed)}% (limite ${max}%)`, until }
      }
    }
    return undefined
  }

  const halted = (until: number) => `usage-guard: sessão interrompida por limite de uso. Renova ${fmtUntil(until)}. Use /usage-guard override para seguir assim mesmo.`

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-guard',
      description: 'Estado do guarda de uso; "override" ignora o bloqueio nesta sessão',
      argumentHint: '[status|override]',
    })
    // outra sessão já esgotou o limite e a janela ainda não renovou: esta nasce interrompida
    const saved = (await $.store.get(HALT_KEY)) as Halt | undefined
    if (saved && saved.until > Date.now()) {
      phase = 'halted'
      haltInfo = saved
      $.ui.status('usage-guard: interrompida')
    } else if (saved) {
      await $.store.delete(HALT_KEY)
    }

    return next(e)
  })

  on('command.run', { command: 'usage-guard' }, async ($, e) => {
    if (e.args.trim() === 'override') {
      isOverridden = true
      phase = 'running'
      $.ui.status(undefined)
      return { text: 'usage-guard: bloqueio ignorado nesta sessão.' }
    }
    const u = await $.session.usage()
    const lines = u.rateLimits.map(l => `${LABEL[l.kind] ?? l.kind}: ${l.percentUsed}%`)
    return {
      text: `usage-guard: fase ${phase}${isOverridden ? ' (override)' : ''}. Limites: sessão ${LIMITS.five_hour}%, semanal ${LIMITS.seven_day}%.\n${lines.join('\n') || 'sem leitura de uso ainda'}`,
    }
  })

  on('session.measure', async ($, e, next) => {
    if (phase === 'running' && !isOverridden) {
      const halt = tripped(e.rateLimits)
      if (halt) {
        phase = 'draining'
        haltInfo = halt
        await $.store.set(HALT_KEY, halt)
        $.ui.toast(`usage-guard: ${halt.reason}. Encerrando a sessão com segurança.`, { timeoutMs: 10000 })
        $.ui.status('usage-guard: encerrando…')
        if (mainTurn) {
          await $.turn.abort({ turnId: mainTurn }).catch(() => undefined)
        }
        isWrapUp = true
        // roda quando a sessão fica ociosa; não bloqueia o hook de medição
        void $.prompt
          .submit({ text: wrapUpPrompt(halt.reason, fmtUntil(halt.until)) })
          .catch(() => {
            phase = 'halted'
          })
      }
    }
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) mainTurn = e.turnId
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      mainTurn = undefined
      // o turno de encerramento terminou (resposta, erro ou limite): a sessão fica travada
      if (phase === 'draining' && isWrapUp && !e.isAborted) {
        phase = 'halted'
        $.ui.status('usage-guard: interrompida')
        $.ui.toast(`usage-guard: sessão encerrada com segurança. Renova ${fmtUntil(haltInfo?.until ?? Date.now())}.`, { timeoutMs: 15000 })
      }
    }
    return next(e)
  })

  on('prompt.submit', ($, e, next) => {
    if (phase === 'running' || e.command) return next(e)
    if (phase === 'draining' && e.origin.kind === 'plugin') return next(e)
    return { drop: halted(haltInfo?.until ?? Date.now()) }
  }).catch(($, e, next) => (phase === 'running' ? next(e) : { drop: 'usage-guard: sessão interrompida por limite de uso.' }))

  on('tool.call', ($, e, next) => {
    if (phase === 'running') return next(e)
    if (phase === 'halted') return { deny: halted(haltInfo?.until ?? Date.now()) }

    // draining: só o necessário para registrar estado, e nunca em subagente
    const deny = (why: string) => ({ deny: `usage-guard: encerrando por limite de uso; ${why}.` })
    if (e.agentId !== undefined) return deny('subagentes não podem agir')
    switch (e.tool) {
      case 'Read':
      case 'Grep':
      case 'Glob':
        return next(e)
      case 'Edit':
      case 'Write':
        return STATUS_FILE.test(e.file_path) ? next(e) : deny('só arquivos de status/roadmap podem ser editados')
      case 'Bash':
        return SAFE_BASH.test(e.command) && !SHELL_META.test(e.command)
          ? next(e)
          : deny('só memo e git de leitura são permitidos')
      default:
        return deny('ferramenta não permitida')
    }
  }).catch(($, e, next) => (phase === 'running' ? next(e) : { deny: 'usage-guard: sessão interrompida por limite de uso.' }))
}
