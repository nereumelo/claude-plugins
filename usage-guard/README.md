# usage-guard

Interrompe qualquer sessão do Claude Code com segurança quando o uso da conta chega ao limite: sessão (5h) a 96% ou semanal (7d) a 98%.

Ao cruzar o limite, a sessão faz um encerramento gracioso com o uso que resta: cancela o turno em andamento, roda um único turno de encerramento (git de leitura, atualização de status em TASKS/STATE/ROADMAP, `memo note` com estado e próximo passo) e então trava prompts e ferramentas até a janela renovar. Sessões novas nascem travadas enquanto o limite não renovar. Durante o encerramento só passam leituras, edição dos arquivos de status, `memo` e git somente leitura; subagentes são negados.

Comando: `/usage-guard` mostra o estado; `/usage-guard override` ignora o bloqueio nesta sessão.

Instalar: `/plugin install usage-guard --marketplace nereumelo/claude-plugins`
