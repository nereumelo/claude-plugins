# tool-log

Painel lateral do Claude Code (`/tool-log`) com as chamadas de ferramenta da
sessão: ícone de estado (✓ ok, ✗ erro, ⊘ negada, … rodando), a ferramenta, um
resumo do que ela fez (comando, arquivo, padrão ou URL) e quanto demorou. O
cabeçalho mostra o total de chamadas, o tempo de trabalho e a mais lenta.
Ferramentas que esperam o usuário (`AskUserQuestion`, planos) ficam fora da conta
e das cores de tempo; tempos a partir de 10s aparecem em amarelo e de 30s em
vermelho. Guarda as últimas 200 chamadas.
