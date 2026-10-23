# plugins

Meus plugins (mods) do Claude Code. Este repositório é um marketplace local:
cada pasta na raiz é um plugin, listado em `.claude-plugin/marketplace.json`.

## Tipos de entrada

Cada entrada em `plugins` do `marketplace.json` é de um de dois tipos, distinguidos
pelo `source` e pela tag:

- **custom**: o plugin mora neste repositório, em uma pasta na raiz.
  `"source": "./<nome>"`, tag `custom`.
- **third-party**: só uma referência; o código fica no repositório do autor e é
  baixado na instalação. `"source"` é um objeto apontando para lá, tag `third-party`.

A **classificação** usa dois campos de cada entrada:

- `category`: o tipo do plugin, um de `mod` (muda a interface/comportamento do
  Claude Code: faixa, painel, status line, hook), `skill`, `agent`, `command`,
  `mcp` ou `other`.
- `tags`: lista livre, sempre com `custom` ou `third-party`, mais o assunto.

## Plugins

| Plugin | Categoria | Origem | O que faz |
| --- | --- | --- | --- |
| [`usage-band`](usage-band/README.md) | mod | custom | Faixa acima do prompt com modelo, uso da sessão (5h) e uso semanal |

## Como usar

### Instalar (permanente)

```sh
claude plugin marketplace add ~/me/plugins
claude plugin install usage-band
```

Ou, dentro de uma sessão: `/plugin marketplace add ~/me/plugins` e depois
`/plugin install usage-band`.

### Testar sem instalar

```sh
claude --plugin-dir ~/me/plugins/usage-band
```

Vale só para aquela sessão, e o Claude recarrega o plugin ao salvar arquivos.

### Editar depois de instalado

Como o marketplace é uma pasta com `source` relativo, o plugin é lido direto
daqui. Edite os arquivos e rode `/reload-plugins` na sessão.

### Validar

```sh
claude plugin validate ~/me/plugins/usage-band
claude plugin validate ~/me/plugins
```

## Adicionar um plugin

### Custom

1. Crie a pasta `<nome>/` com `.claude-plugin/plugin.json` e o conteúdo do plugin.
2. Acrescente a entrada em `plugins` e valide:

```json
{
  "name": "<nome>",
  "source": "./<nome>",
  "description": "uma linha",
  "category": "mod",
  "tags": ["custom", "assunto"]
}
```

### Third-party (só referência)

Não copie o código. Acrescente uma entrada apontando para o repositório do autor:

```json
{
  "name": "<nome>",
  "source": { "source": "github", "repo": "<owner>/<repo>" },
  "description": "uma linha",
  "category": "skill",
  "tags": ["third-party", "assunto"]
}
```

Para um plugin que mora numa subpasta de um repositório maior, ou fora do GitHub:

```json
{ "source": { "source": "git-subdir", "url": "https://github.com/<owner>/<repo>.git", "path": "plugins/<nome>" } }
{ "source": { "source": "url", "url": "https://exemplo.com/repo.git" } }
```

Depois, `claude plugin install <nome>` baixa do repositório do autor. Para fixar
uma versão, acrescente `"ref": "<tag ou branch>"` dentro de `source`.

Em ambos os casos, valide com `claude plugin validate ~/me/plugins`, atualize a
tabela de plugins acima e faça o commit.

## Compartilhar

Publicando este repositório no GitHub, qualquer pessoa instala com:

```sh
claude plugin install usage-band --marketplace <owner>/plugins
```
