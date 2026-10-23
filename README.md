# plugins

Meus plugins (mods) do Claude Code. Este repositório é um marketplace local:
cada pasta na raiz é um plugin, listado em `.claude-plugin/marketplace.json`.

## Plugins

| Plugin | O que faz |
| --- | --- |
| [`usage-band`](usage-band/README.md) | Faixa acima do prompt com modelo, uso da sessão (5h) e uso semanal |

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

## Adicionar um plugin novo

1. Crie a pasta `<nome>/` com `.claude-plugin/plugin.json` e `hooks/`.
2. Acrescente uma entrada em `plugins` no `.claude-plugin/marketplace.json`
   (`"source": "./<nome>"`).
3. Valide e faça o commit.

## Compartilhar

Publicando este repositório no GitHub, qualquer pessoa instala com:

```sh
claude plugin install usage-band --marketplace <owner>/plugins
```
