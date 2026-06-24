// Diagnostico (read-only): lista as abas reais de cada planilha de origem do Config
// + da planilha de destino. Ajuda a achar nome de aba errado.
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { getAuthClient, withRetry } = require("../lib/google");
const { parseSources } = require("../src/transform");

async function main() {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"));
  const auth = await getAuthClient(["https://www.googleapis.com/auth/spreadsheets.readonly"]);
  const sheets = google.sheets({ version: "v4", auth });

  const cfgRange = `'${cfg.configSheet.replace(/'/g, "''")}'!${cfg.configRange}`;
  const cfgResp = await withRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId: cfg.destSpreadsheetId, range: cfgRange, valueRenderOption: "UNFORMATTED_VALUE" })
  );
  const sources = parseSources(cfgResp.data.values, cfg.configCols);

  const ids = new Map(); // id -> labels que a usam
  ids.set(cfg.destSpreadsheetId, ["(DESTINO)"]);
  for (const s of sources) {
    if (!ids.has(s.id)) ids.set(s.id, []);
    ids.get(s.id).push(`${s.label} -> aba pedida: "${s.aba}"`);
  }

  for (const [id, usos] of ids) {
    const meta = await withRetry(() =>
      sheets.spreadsheets.get({ spreadsheetId: id, fields: "properties.title,sheets.properties.title" })
    );
    console.log(`\n=== ${id}  (${meta.data.properties.title}) ===`);
    console.log("  ABAS REAIS:", meta.data.sheets.map((s) => `"${s.properties.title}"`).join(", "));
    console.log("  USADA POR:");
    usos.forEach((u) => console.log("    -", u));
  }
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
