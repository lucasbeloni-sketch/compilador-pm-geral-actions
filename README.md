# compilador-pm-geral-actions

Robô headless (GitHub Actions) que **substitui o `QUERY` + `IMPORTRANGE`** que vivia em
`PM_GERAL (ESPELHO)!A4` e quebrava por erro de importação.

Em vez da fórmula, um script Node usa a **Google Sheets API** (service account) para:

1. Ler a lista de origens em **`Config!BK4:BN`** da planilha de destino.
2. Ler o intervalo de cada origem.
3. Juntar tudo e manter só as linhas onde a **coluna G (Col7)** não está vazia
   (mesma regra do `WHERE Col7 IS NOT NULL`).
4. Limpar `PM_GERAL (ESPELHO)!A4:BO` e escrever o resultado a partir de `A4`.

## Config na própria planilha (não no código)

Na aba **`Config`** do destino, intervalo **`BK4:BN`**, uma linha por origem:

| BK (label, opcional) | BL (ID) | BM (Aba) | BN (Range) |
|---|---|---|---|
| Oeste | `1cia7oxvg8Pl...` | `PM_OESTE (ESPELHO)` | `A4:BO` |
| Ext Oeste | `1t0gIBmAnb...` | `PM_EXT_OESTE (ESPELHO)` | `A4:BO` |
| Sudoeste | `1CS5Yhjshqu...` | `PM_SUDOESTE (ESPELHO)` | `A4:BO` |
| Centro | `1uSlgCAhkn...` | `PM_CENTRO (ESPELHO)` | `A4:BO` |

- **BL** = ID da planilha de origem (o trecho entre `/d/` e `/edit` da URL).
- **BM** = nome exato da aba.
- **BN** = intervalo, ex. `A4:BO`.
- Linha sem ID/Aba/Range é ignorada. Para adicionar/remover origem, edite a planilha — **não mexe no código**.

O resto (destino, regra de filtro, render) está em [`config.json`](./config.json).

## Pré-requisitos (uma vez)

1. **Secret `GOOGLE_CREDENTIALS`** no repo: conteúdo do JSON da service account
   (a mesma dos outros robôs: `robo-api-python-google-drive@angelic-edition-484319-p0.iam.gserviceaccount.com`).
2. **Compartilhar com a service account** (e-mail acima):
   - planilha de **destino** como **Editor**;
   - as **4 planilhas de origem** como **Leitor** (Viewer) — basta leitura.
   > IMPORTRANGE não precisa disso, mas a API sim: a SA só lê o que foi compartilhado com ela.

## Rodar

- **GitHub Actions:** automático no cron (`*/30 * * * *`) + botão manual (`workflow_dispatch`).
- **Local (validação):**
  ```bash
  npm install
  npm test                              # testes unitários (lógica pura)
  GOOGLE_CREDENTIALS="$(cat caminho/do.json)" npm start -- --dry-run   # lê tudo, NÃO escreve
  GOOGLE_CREDENTIALS="$(cat caminho/do.json)" npm start                # escreve no destino
  ```
  `--dry-run` (ou `DRY_RUN=1`) lê origens + filtra e mostra contagem/amostra, sem tocar no destino.

## Tipos de valor (mirror)

Padrão lê `UNFORMATTED_VALUE` + datas como texto e escreve `USER_ENTERED` — preserva número como
número e data como data, igual o IMPORTRANGE fazia. Ajustável em `config.json` (`valueRenderOption`,
`dateTimeRenderOption`, `valueInputOption`).
