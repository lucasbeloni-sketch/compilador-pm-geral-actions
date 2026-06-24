// Logica pura (sem rede) — testavel isolada.

// Monta a referencia A1 de uma aba: 'Nome Aba'!Range.
// Aspas simples no nome sao escapadas dobrando (regra do Sheets).
function buildA1(aba, range) {
  const safe = String(aba).replace(/'/g, "''");
  return `'${safe}'!${range}`;
}

// IDs de planilha do Google tem ~44 chars [A-Za-z0-9_-]. Usado pra descartar
// linhas de cabecalho ("ID") ou lixo que cairam dentro do range do Config.
function looksLikeSheetId(id) {
  return /^[A-Za-z0-9_-]{25,}$/.test(id);
}

// Le as linhas do Config (BK4:BN) e devolve as origens validas.
// cols = indice (0-based) DENTRO da linha BK4:BN: BK=0, BL=1, BM=2, BN=3.
// Linha so entra se ID parecer id de planilha + Aba + Range preenchidos.
// (Cabecalho "Unidade/ID/Aba/Intervalo" na 1a linha cai fora pelo looksLikeSheetId.)
function parseSources(configRows, cols) {
  const out = [];
  for (const row of configRows || []) {
    const id = (row[cols.id] ?? "").toString().trim();
    const aba = (row[cols.aba] ?? "").toString().trim();
    const range = (row[cols.range] ?? "").toString().trim();
    const label = (row[cols.label] ?? "").toString().trim();
    if (!looksLikeSheetId(id) || !aba || !range) continue;
    out.push({ id, aba, range, label, a1: buildA1(aba, range) });
  }
  return out;
}

// Mantem so linhas onde a coluna colIndex (0-based) NAO esta vazia/nula.
// Espelha "WHERE Col7 IS NOT NULL" do QUERY (Col7 = G = indice 6).
function filterByCol(rows, colIndex) {
  return (rows || []).filter((row) => {
    const v = row?.[colIndex];
    return v !== undefined && v !== null && String(v).trim() !== "";
  });
}

// Deixa a matriz retangular: toda linha com o mesmo nro de colunas (o maior achado).
// Evita desalinhamento ao escrever (linhas com vazios no fim vem curtas da API).
function padToRectangle(rows, minWidth = 0) {
  const width = Math.max(minWidth, 0, ...(rows || []).map((r) => r.length));
  return (rows || []).map((r) => {
    const copy = r.slice();
    while (copy.length < width) copy.push("");
    return copy;
  });
}

// Converte "A4:BO" -> 67 (nro de colunas), pra padronizar a largura.
// Tolerante: se nao casar, devolve 0 (ai usa o max das linhas).
function rangeWidth(range) {
  const m = String(range).match(/^([A-Za-z]+)\d*:([A-Za-z]+)\d*$/);
  if (!m) return 0;
  const toNum = (s) =>
    s.toUpperCase().split("").reduce((acc, c) => acc * 26 + (c.charCodeAt(0) - 64), 0);
  return toNum(m[2]) - toNum(m[1]) + 1;
}

module.exports = { buildA1, parseSources, filterByCol, padToRectangle, rangeWidth };
