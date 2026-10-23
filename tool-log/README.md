# tool-log

Painel lateral do Claude Code (`/tool-log`) com as chamadas de ferramenta da
sessão, agrupadas por turno (o prompt é o título do grupo, com o subtotal). Cada
linha mostra o estado (✓ ok, ✗ erro, ⊘ negada, … rodando), a ferramenta, um
resumo do que ela fez e uma barra de duração proporcional à chamada mais lenta
do grupo, com o tempo. Chamadas de subagente aparecem indentadas.

Atalhos (com o painel focado): `e` só erros, `l` só chamadas de 5s ou mais, `t`
cicla o filtro por ferramenta, `p` pausa o registro, `c` limpa. Clique no título
de um turno para recolher ou abrir o grupo, e numa chamada para ver a entrada
completa. Esperas do usuário (`AskUserQuestion`, planos) ficam fora do tempo de
trabalho e das cores; tempos a partir de 10s ficam amarelos e de 30s vermelhos.
Em largura menor que 90 colunas some a barra, e abaixo de 60 some o resumo.
Guarda as últimas 200 chamadas e 50 turnos.
