import { describe, expect, it } from "vitest";

import { buildErrorReport, csvCell, CSV_BOM } from "./error-report";

describe("csvCell", () => {
  it("antepone ' a lo que Excel ejecutaría como fórmula", () => {
    for (const dangerous of ["=1+1", "+cmd", "-2", "@SUM(A1)", "\tx", "\rx"]) expect(csvCell(dangerous).replace(/^"/, "")).toMatch(/^'/);
  });

  it("entrecomilla comas, comillas y saltos de línea", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("uno\ndos")).toBe('"uno\ndos"');
    expect(csvCell("normal")).toBe("normal");
  });
});

describe("buildErrorReport", () => {
  const rejected = [
    { row: 18, raw: { area: "Tropical", mesa: "M1", menuUrl: "" }, extra: {}, issues: [{ row: 18, field: "menuUrl" as const, value: null, label: "Falta Link del menú", message: "…", severity: "error" as const, code: "REQUIRED_EMPTY" as const }] },
    { row: 5, raw: { area: "=HYPERLINK(1)", mesa: "" }, extra: {}, issues: [{ row: 5, field: "mesa" as const, value: null, label: "Mesa vacía", message: "…", severity: "error" as const, code: "REQUIRED_EMPTY" as const }] },
  ];

  it("lleva BOM, cabecera en español, filas ordenadas y valores originales protegidos", () => {
    const csv = buildErrorReport(rejected, [{ row: 80, values: { area: "Bar", mesa: "M2" }, reason: "Registro duplicado (igual a fila 12)" }]);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Fila,Campo,Problema,Valor,Área,Estación,Mesa,Sub-grupo,Concepto,Link del menú,Link del QR");
    expect(lines[1]).toMatch(/^5,Mesa,Mesa vacía,,'=HYPERLINK\(1\)/);
    expect(lines[2]).toMatch(/^18,Link del menú,Falta Link del menú/);
    expect(lines[3]).toMatch(/^80,,Registro duplicado \(igual a fila 12\),,Bar/);
  });
});
