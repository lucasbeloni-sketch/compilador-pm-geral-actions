const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { getAuthClient, withRetry } = require("../lib/google");
const { parseSources, filterByCol, padToRectangle, rangeWidth } = require("./transform");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function loadConfig() {
  const raw = fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8");
  return JSON.parse(raw);
}

async function main() {
  const cfg = loadConfig();
  const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

  const authClient = await getAuthClient(SCOPES);
  const sheets = google.sheets({ version: "v4", auth: authClient });

  // 1) Le o Config (BK4:BN) do destino -> lista de origens.
  const cfgRange = `'${cfg.configSheet.replace(/'/g, "''")}'!${cfg.configRange}`;
  const cfgResp = await withRetry(
    () =>
      sheets.spreadsheets.values.get({
        spreadsheetId: cfg.destSpreadsheetId,
        range: cfgRange,
        valueRenderOption: "UNFORMATTED_VALUE",
      }),
    { label: "get-config" }
  );
  const sources = parseSources(cfgResp.data.values, cfg.configCols);
  if (!sources.length) throw new Error(`Nenhuma origem valida em ${cfgRange}. Confira BL/BM/BN.`);
  console.log(`[config] ${sources.length} origem(ns):`);
  sources.forEach((s) => console.log(`  - ${s.label || "(sem label)"}: ${s.id} ${s.a1}`));

  // 2) Le as origens. Agrupa por planilha: varias abas da MESMA planilha vem
  //    num unico batchGet (menos chamadas -> menos 503 nessas planilhas grandes).
  const byId = new Map();
  for (const s of sources) {
    if (!byId.has(s.id)) byId.set(s.id, []);
    byId.get(s.id).push(s);
  }

  const rowsByA1 = new Map(); // a1 -> linhas lidas
  const badRanges = []; // origens com aba/range invalido (ex nome de aba errado)
  for (const [id, group] of byId) {
    const ranges = group.map((s) => s.a1);
    try {
      const resp = await withRetry(
        () =>
          sheets.spreadsheets.values.batchGet({
            spreadsheetId: id,
            ranges,
            valueRenderOption: cfg.valueRenderOption,
            dateTimeRenderOption: cfg.dateTimeRenderOption,
          }),
        { label: `batchGet-${id.slice(0, 8)}` }
      );
      const vrs = resp.data.valueRanges || [];
      group.forEach((s, i) => {
        const rows = vrs[i]?.values || [];
        rowsByA1.set(s.a1, rows);
        console.log(`[origem] ${s.label || s.id}: ${rows.length} linha(s) brutas`);
      });
    } catch (e) {
      // No batchGet, 1 range invalido derruba TODA a planilha. Cai pra range-a-range
      // pra identificar exatamente qual aba/range esta errado (e ler os validos).
      console.warn(`[fallback] batchGet de ${id.slice(0, 8)} falhou (${e.message}); lendo range-a-range`);
      for (const s of group) {
        try {
          const r = await withRetry(
            () =>
              sheets.spreadsheets.values.get({
                spreadsheetId: s.id,
                range: s.a1,
                valueRenderOption: cfg.valueRenderOption,
                dateTimeRenderOption: cfg.dateTimeRenderOption,
              }),
            { label: `get-${s.label || s.id}` }
          );
          const rows = r.data.values || [];
          rowsByA1.set(s.a1, rows);
          console.log(`[origem] ${s.label || s.id}: ${rows.length} linha(s) brutas`);
        } catch (e2) {
          badRanges.push(`${s.label || "(sem label)"} [${s.id}] ${s.a1} -> ${e2.message}`);
        }
      }
    }
  }

  // Espelho parcial e pior que espelho velho: se alguma origem falhou, aborta sem escrever.
  if (badRanges.length) {
    throw new Error(
      `Origem(ns) invalida(s) no Config (corrija a aba/range em Config!${cfg.configRange}):\n  - ` +
        badRanges.join("\n  - ")
    );
  }

  // Remonta na ORDEM do Config (empilhamento igual ao QUERY original).
  const allRows = [];
  let width = rangeWidth(sources[0].range); // largura alvo (ex A4:BO = 67)
  for (const s of sources) {
    const rows = rowsByA1.get(s.a1) || [];
    width = Math.max(width, ...rows.map((r) => r.length));
    allRows.push(...rows);
  }

  // 3) Filtra Col7 (coluna G) nao-vazia + padroniza largura.
  const filtered = filterByCol(allRows, cfg.filterColIndex);
  const rect = padToRectangle(filtered, width);
  console.log(`[filtro] ${allRows.length} brutas -> ${rect.length} com Col${cfg.filterColIndex + 1} preenchida`);

  // Guarda anti-apagao: poucas linhas = provavel leitura anomala. Aborta antes de limpar.
  const minRows = Number(cfg.minRows) || 0;
  if (rect.length < minRows) {
    throw new Error(
      `So ${rect.length} linha(s) filtrada(s), abaixo do minimo (minRows=${minRows}). ` +
        `Abortando SEM limpar o destino pra nao apagar o espelho bom. ` +
        `Se as origens realmente esvaziaram, baixe minRows no config.json.`
    );
  }

  if (dryRun) {
    console.log("[dry-run] nao escreve no destino. Amostra (1a linha):");
    console.log(JSON.stringify(rect[0] || [], null, 0).slice(0, 500));
    return;
  }

  // 4) Limpa o destino e escreve.
  const destSheetA1 = `'${cfg.destSheet.replace(/'/g, "''")}'!`;
  await withRetry(
    () =>
      sheets.spreadsheets.values.clear({
        spreadsheetId: cfg.destSpreadsheetId,
        range: `${destSheetA1}${cfg.destClearRange}`,
      }),
    { label: "clear-dest" }
  );
  console.log(`[destino] limpo ${cfg.destClearRange}`);

  if (rect.length) {
    await withRetry(
      () =>
        sheets.spreadsheets.values.update({
          spreadsheetId: cfg.destSpreadsheetId,
          range: `${destSheetA1}${cfg.destStartCell}`,
          valueInputOption: cfg.valueInputOption,
          requestBody: { values: rect },
        }),
      { label: "write-dest" }
    );
    console.log(`[destino] escritas ${rect.length} linha(s) x ${width} col a partir de ${cfg.destStartCell}`);
  } else {
    console.log("[destino] nenhuma linha pra escrever (so limpou).");
  }

  console.log("OK.");
}

main().catch((err) => {
  console.error("FALHOU:", err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
