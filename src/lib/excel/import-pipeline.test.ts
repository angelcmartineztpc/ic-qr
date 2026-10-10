import { describe, expect, it } from "vitest";

import { formatIssueLine } from "@/lib/validation/messages.es";
import type { ImportResult } from "@/types";

import { detectHeaderRow } from "./headers";
import { buildImportResult, fillMerges, needsColumnMapping } from "./import-pipeline";
import type { RawCell, RawSheet } from "./types";

const s = (v: string): RawCell => ({ t: "s", v, w: v });
const n = (v: number): RawCell => ({ t: "n", v, w: String(v) });
const HEADER = ["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú", "Link del QR", "Notas"].map(s);
const ok = (area: string, mesa: string | number, extra: { menu?: string; qr?: string; notas?: string } = {}): Array<RawCell | null> => [
  s(area), null, typeof mesa === "number" ? n(mesa) : s(mesa), null, null, s(extra.menu ?? `https://menu.example.com/${area}/${mesa}`), extra.qr ? s(extra.qr) : null, extra.notas ? s(extra.notas) : null,
];

function sheetOf(rows: Array<Array<RawCell | null>>, merges: RawSheet["merges"] = []): RawSheet {
  return { name: "Mesas", state: "visible", rows, merges, rowCount: rows.length, colCount: 8 };
}
function run(rows: Array<Array<RawCell | null>>, extra: Partial<Parameters<typeof buildImportResult>[0]> = {}): ImportResult {
  const sheet = sheetOf(rows);
  const detected = detectHeaderRow(sheet.rows);
  if (!detected) throw new Error("sin cabecera");
  const out = buildImportResult({ fileName: "mesas.xlsx", sheet, headerRowIndex: detected.rowIndex, mapping: detected.mapping, maxRows: 5000, ...extra });
  if (!out.ok) throw new Error(out.issues[0]?.code);
  return out.result;
}

describe("buildImportResult", () => {
  it("100 filas válidas + 5 con error: ninguna se pierde", () => {
    const rows: Array<Array<RawCell | null>> = [HEADER];
    for (let i = 1; i <= 100; i++) rows.push(ok("Tropical", i));
    rows.push(ok("Bar", "B1", { menu: "" })); // 102: sin menú
    rows.push([s("Bar"), null, null, null, null, s("https://menu.example.com/x")]); // 103: sin mesa
    rows.push(ok("Bar", "B3", { menu: "no es una url" })); // 104
    rows.push(ok("", "B4")); // 105: sin área
    rows.push(ok("Bar", "B5", { qr: "ftp://x" })); // 106: Link del QR inválido
    const result = run(rows);
    expect(result.stats).toMatchObject({ valid: 100, withErrors: 5, duplicates: 0 });
    expect(result.totalRows).toBe(105);
    expect(result.successful).toHaveLength(100);
    expect(result.rejected.map((r) => r.row)).toEqual([102, 103, 104, 105, 106]);
    expect(result.totalRows).toBe(result.stats.valid + result.stats.withErrors + result.stats.duplicates);
  });

  it("usa el número real de fila y los mensajes del spec", () => {
    const rows: Array<Array<RawCell | null>> = [[s("Reporte")], [], HEADER, ok("Tropical", "M1")];
    while (rows.length < 17) rows.push(ok("Bar", rows.length));
    rows.push(ok("Bar", "M18", { menu: "" })); // fila 18
    const result = run(rows);
    const lines = result.errors.map(formatIssueLine);
    expect(lines).toContain("Fila 18: Falta Link del menú");
    expect(result.headerRow).toBe(3);
  });

  it("mensajes de Mesa vacía y Link del menú inválido", () => {
    const rows = [HEADER, [s("Bar"), null, null, null, null, s("https://menu.example.com/x")], ok("Bar", "M2", { menu: "esto no es un link" })];
    const lines = run(rows).errors.map(formatIssueLine);
    expect(lines).toContain("Fila 2: Mesa vacía");
    expect(lines).toContain("Fila 3: Link del menú inválido");
  });

  it("duplicados del archivo: la primera es la original; el resto es aviso, no error", () => {
    const menu = "https://menu.example.com/tropical";
    const rows = [HEADER, ok("Tropical", "M1", { menu }), ok("Bar", "B1"), ok("TROPICAL", "m1", { menu })];
    const result = run(rows);
    expect(result.stats).toMatchObject({ valid: 2, duplicates: 1, withErrors: 0 });
    expect(result.duplicates).toEqual([expect.objectContaining({ scope: "file", rows: [2, 4] })]);
    expect(result.duplicateRows.map((r) => r.row)).toEqual([4]);
    expect(result.warnings.map(formatIssueLine)).toContain("Fila 4: Registro duplicado (igual a fila 2)");
    expect(result.errors).toHaveLength(0);
  });

  it("enteros de Excel como mesa: 1 y no «1.0»; columnas no mapeadas van a extra", () => {
    const result = run([HEADER, ok("Tropical", 1, { notas: "terraza" })]);
    expect(result.successful[0]).toMatchObject({ draft: { mesa: "1" }, extra: { Notas: "terraza" } });
    expect(result.warnings.some((w) => w.code === "UNMAPPED_COLUMN")).toBe(true);
  });

  it("un Link del QR válido se conserva (nunca se generará otro)", () => {
    const result = run([HEADER, ok("Tropical", 1, { qr: "https://cdn.example.com/qr/1.svg" })]);
    expect(result.successful[0]?.draft.qrUrl).toBe("https://cdn.example.com/qr/1.svg");
  });

  it("host del QR fuera de la lista permitida: la fila se importa con aviso", () => {
    const result = run([HEADER, ok("Tropical", 1, { qr: "https://otro.example.org/qr.svg" })], { isQrHostAllowed: (host) => host.endsWith("example.com") });
    expect(result.stats.valid).toBe(1);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "QR_URL_HOST_NOT_ALLOWED", row: 2, severity: "warning" }));
  });

  it("puerto distinto de 443 en el Link del QR: aviso de QR no seguro, la fila se importa", () => {
    const result = run([HEADER, ok("Tropical", 1, { qr: "https://cdn.example.com:8443/q.svg" })]);
    expect(result.stats.valid).toBe(1);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "QR_URL_UNSAFE" }));
  });

  it("credenciales en el Link del QR: la fila se rechaza (nunca se genera otro QR en su lugar)", () => {
    const result = run([HEADER, ok("Tropical", 1, { qr: "https://u:p@cdn.example.com/q.svg" })]);
    expect(result.rejected[0]?.issues[0]).toMatchObject({ field: "qrUrl", code: "INVALID_URL" });
  });

  it("Link del menú con http: aviso, la fila se importa", () => {
    const result = run([HEADER, ok("Tropical", 1, { menu: "http://menu.example.com/a" })]);
    expect(result.stats.valid).toBe(1);
    expect(result.warnings.some((w) => w.code === "HTTP_URL")).toBe(true);
  });

  it("celdas con error de Excel excluyen la fila pero la conservan en rejected", () => {
    const bad = ok("Bar", "B1");
    bad[4] = { t: "e", v: 42, w: "#N/A" };
    const result = run([HEADER, bad]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.issues[0]).toMatchObject({ code: "CELL_ERROR", field: "concepto" });
  });

  it("filas vacías no cuentan", () => {
    const result = run([HEADER, ok("Tropical", 1), [], [null, null], ok("Bar", 2)]);
    expect(result.totalRows).toBe(2);
    expect(result.stats.emptyRowsSkipped).toBe(2);
  });

  it("más de 5000 filas: rechazo con la acción de truncar; con truncate se importan N y queda el aviso", () => {
    const rows: Array<Array<RawCell | null>> = [HEADER];
    for (let i = 1; i <= 12; i++) rows.push(ok("Tropical", i));
    const sheet = sheetOf(rows);
    const detected = detectHeaderRow(sheet.rows)!;
    const base = { fileName: "x.xlsx", sheet, headerRowIndex: detected.rowIndex, mapping: detected.mapping, maxRows: 10 };
    const rejected = buildImportResult(base);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.issues[0]?.code).toBe("TOO_MANY_ROWS");
    const truncated = buildImportResult({ ...base, truncateTo: 10 });
    expect(truncated.ok && truncated.result.stats).toMatchObject({ valid: 10, truncatedTo: 10 });
    expect(truncated.ok && truncated.result.warnings.some((w) => w.code === "ROWS_TRUNCATED_BY_USER")).toBe(true);
  });

  it("sin la columna Mesa: no procesa filas y pide el mapeo", () => {
    const sheet = sheetOf([["Área", "Link del menú", "Concepto"].map(s), [s("Bar"), s("https://x.com"), s("a")]]);
    const detected = detectHeaderRow(sheet.rows)!;
    const out = buildImportResult({ fileName: "x.xlsx", sheet, headerRowIndex: 0, mapping: detected.mapping, maxRows: 5000 });
    expect(out.ok && out.result.missingColumns).toEqual(["mesa"]);
    expect(out.ok && out.result.successful).toEqual([]);
    expect(needsColumnMapping(detected.mapping)).toBe(true);
  });

  it("columnas opcionales ausentes avisan MISSING_COLUMN y no bloquean", () => {
    const sheet = sheetOf([["Área", "Mesa", "Link del menú"].map(s), [s("Bar"), s("M1"), s("https://x.com/a")]]);
    const detected = detectHeaderRow(sheet.rows)!;
    const out = buildImportResult({ fileName: "x.xlsx", sheet, headerRowIndex: 0, mapping: detected.mapping, maxRows: 5000 });
    expect(out.ok && out.result.stats.valid).toBe(1);
    expect(out.ok && out.result.warnings.filter((w) => w.code === "MISSING_COLUMN").map((w) => w.field).sort()).toEqual(["concepto", "estacion", "qrUrl", "subgrupo"]);
  });
});

describe("fillMerges", () => {
  it("rellena celdas combinadas de datos con un solo aviso por rango", () => {
    const sheet = sheetOf([HEADER, ok("Tropical", 1), [null, null, n(2)], [null, null, n(3)]], [[1, 0, 3, 0]]);
    const { rows, issues } = fillMerges(sheet, 0);
    expect(rows[2]?.[0]).toEqual(s("Tropical"));
    expect(rows[3]?.[0]).toEqual(s("Tropical"));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "MERGED_CELLS_FILLED", row: 2 });
  });

  it("no toca combinaciones de la cabecera o de títulos", () => {
    const sheet = sheetOf([[s("Título")], HEADER, ok("Bar", 1)], [[0, 0, 0, 5]]);
    expect(fillMerges(sheet, 1).issues).toHaveLength(0);
  });
});
