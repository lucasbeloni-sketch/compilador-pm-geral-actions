const test = require("node:test");
const assert = require("node:assert");
const {
  buildA1,
  parseSources,
  filterByCol,
  padToRectangle,
  rangeWidth,
} = require("../src/transform");

test("buildA1 envolve nome em aspas e escapa aspas internas", () => {
  assert.strictEqual(buildA1("PM_OESTE (ESPELHO)", "A4:BO"), "'PM_OESTE (ESPELHO)'!A4:BO");
  assert.strictEqual(buildA1("O'Brien", "A1:B2"), "'O''Brien'!A1:B2");
});

test("parseSources: pula cabecalho e linhas sem id de planilha valido", () => {
  const cols = { label: 0, id: 1, aba: 2, range: 3 };
  const ID1 = "1cia7oxvg8PlQqVglYbVC9gztOwqgcOoF67a4EVCVSHM";
  const ID2 = "1t0gIBmAnbqw2T-0Pq4Arny0LPIko0_UumII4cDiNO8I";
  const rows = [
    ["Unidade", "ID", "Aba", "Intervalo"], // cabecalho -> fora (id "ID" curto)
    ["Oeste", ID1, "PM_OESTE (ESPELHO)", "A4:BO"],
    ["", ID2, "PM_EXT_OESTE (ESPELHO)", "A4:BO"], // sem label, mas valido
    ["Faltando", "", "Aba", "A4:BO"], // sem id -> fora
    ["Faltando", ID1, "", "A4:BO"], // sem range/aba -> fora
    [], // vazia -> fora
  ];
  const out = parseSources(rows, cols);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].a1, "'PM_OESTE (ESPELHO)'!A4:BO");
  assert.strictEqual(out[1].id, ID2);
});

test("filterByCol: mantem so linhas com Col7 (indice 6) preenchida", () => {
  const G = 6;
  const rows = [
    [1, 2, 3, 4, 5, 6, "tem", 8],
    [1, 2, 3, 4, 5, 6, "", 8], // G vazio -> fora
    [1, 2, 3, 4, 5, 6], // G undefined -> fora
    [1, 2, 3, 4, 5, 6, "   ", 8], // G so espacos -> fora
    [1, 2, 3, 4, 5, 6, 0, 8], // G = 0 (numero) -> ENTRA (0 nao e vazio)
    [1, 2, 3, 4, 5, 6, null, 8], // G null -> fora
  ];
  const out = filterByCol(rows, G);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0][6], "tem");
  assert.strictEqual(out[1][6], 0);
});

test("padToRectangle: toda linha fica com a maior largura", () => {
  const out = padToRectangle([[1, 2], [1, 2, 3, 4], [1]], 3);
  assert.deepStrictEqual(out, [
    [1, 2, "", ""],
    [1, 2, 3, 4],
    [1, "", "", ""],
  ]);
});

test("rangeWidth: A4:BO = 67 colunas", () => {
  assert.strictEqual(rangeWidth("A4:BO"), 67);
  assert.strictEqual(rangeWidth("A:BO"), 67);
  assert.strictEqual(rangeWidth("A1:A1"), 1);
  assert.strictEqual(rangeWidth("lixo"), 0);
});
