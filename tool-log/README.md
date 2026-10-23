# tool-log

Painel lateral do Claude Code (`/tool-log`) com as chamadas de ferramenta da
sessão, agrupadas por turno (o prompt é o título do grupo, com o subtotal). Cada
linha mostra o estado (✓ ok, ✗ erro, ⊘ negada, … rodando), a ferramenta, um
resumo do que ela fez e uma barra de duração proporcional à chamada mais lenta
do grupo (só a partir de 1s), com o tempo. Chamadas de subagente aparecem
indentadas com `└`, logo abaixo do `Agent` que as disparou, e o tempo do `Agent`
é o do subagente até o relatório de volta (que não aparece como chamada).

Atalhos, mostrados na barra do painel (com ele focado): `e` só erros, `l` só chamadas de 5s ou mais, `t`
cicla o filtro por ferramenta, `p` pausa o registro, `c` limpa. Clique no título
de um turno para recolher ou abrir o grupo, e numa chamada para ver a entrada
completa. Esperas do usuário (`AskUserQuestion`, planos) ficam fora do tempo de
trabalho e das cores; tempos a partir de 10s ficam amarelos e de 30s vermelhos; a barra de uma chamada
com erro ou negada é vermelha.
A barra de duração encolhe com a largura (10, 6 ou nenhuma, abaixo de 48 colunas) e o resumo some abaixo de 40.
O tempo de cada chamada conta a partir de quando o engine a libera (evento
`tool.check`), mas a API de plugins não expõe o início real da execução: a duração
ainda pode incluir a decisão de permissão, que no modo auto leva alguns segundos
(um `sleep 2` aparece com ~5s; `ls` e `git log`, não). Trate o tempo como um limite
superior e compare chamadas entre si, não com um cronômetro. O tempo do
`Agent` fica esmaecido e sem barra, e um `!` amarelo no lugar do `✓` avisa que
um comando do subagente falhou. Os grupos de turno são separados por uma linha
em branco. Com um filtro ativo, uma linha mostra o filtro e quantas chamadas ele deixa.
Guarda as últimas 200 chamadas e 50 turnos.
