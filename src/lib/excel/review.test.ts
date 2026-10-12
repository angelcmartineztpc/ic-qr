import { describe, expect, it } from "vitest";

import { createRecord } from "@/lib/records/factory";
import { DEFAULT_DUPLICATE_KEY } from "@/schemas/import";
import type { DuplicateKeyConfig, ImportedRow, ImportResult } from "@/types";

import { draft, NOW } from "../../../tests/helpers/records";
import { planImport, planSize, reviewImport, validRows } from "./review";

const config: DuplicateKeyConfig = { ...DEFAULT_DUPLICATE_KEY, fields: [...DEFAULT_DUPLICATE_KEY.fields] };
const row = (n: number, overrides: Parameters<typeof draft>[0] = {}): ImportedRow => ({ row: n, draft: draft(overrides), extra: {}, issues: [], duplicateKey: `k${n}` });

function resultOf(successful: ImportedRow[], duplicateRows: ImportedRow[] = [], rejected: ImportResult["rejected"] = []): ImportResult {
  return {
    fileName: "a.xlsx", sheetName: "Mesas", headerRow: 1, mapping: [], missingColumns: [], totalRows: successful.length + duplicateRows.length + rejected.length,
    successful, rejected, errors: [], warnings: [], duplicates: [], duplicateRows,
    stats: { valid: successful.length, withErrors: rejected.length, duplicates: duplicateRows.length, emptyRowsSkipped: 0 },
  };
}

describe("reviewImport", () => {
  it("recalcula los duplicados con la clave del proyecto, no con la del servidor", () => {
    // El servidor las trató como distintas (clave por defecto); con la clave «solo mesa» son iguales.
    const result = resultOf([row(2, { mesa: "M1", area: "A" }), row(3, { mesa: "M1", area: "B" })]);
    expect(reviewImport(result, config, []).stats).toMatchObject({ valid: 2, duplicates: 0 });
    const byMesa = reviewImport(result, { ...config, fields: ["mesa"] }, []);
    expect(byMesa.stats).toMatchObject({ valid: 1, duplicates: 1 });
    expect(byMesa.fileGroups[0]?.rows).toEqual([2, 3]);
  });

  it("una fila que duplica al proyecto pasa de «válidas» a «duplicadas» sin contarse dos veces (invariante)", () => {
    const existing = createRecord(draft({ mesa: "M1" }), { now: NOW, order: 0, origin: "manual", id: "e1" });
    const result = resultOf([row(2, { mesa: "M1" }), row(3, { mesa: "M2" })], [row(4, { mesa: "M1" })], [{ row: 5, raw: {}, extra: {}, issues: [{ row: 5, field: "mesa", value: null, label: "Mesa vacía", message: "m", severity: "error", code: "REQUIRED_EMPTY" }] }]);
    const model = reviewImport(result, config, [existing]);
    expect(model.projectGroups).toHaveLength(1);
    // filas 2 y 4 son «igual a e1»; la 3 es válida; la 5 tiene error.
    expect(model.stats).toEqual({ totalRows: 4, valid: 1, withErrors: 1, duplicates: 2 });
    expect(model.stats.totalRows).toBe(model.stats.valid + model.stats.withErrors + model.stats.duplicates);
  });

  it("validRows une originales y duplicadas por número de fila", () => {
    expect(validRows(resultOf([row(2), row(5)], [row(3)])).map((r) => r.row)).toEqual([2, 3, 5]);
  });
});

describe("planImport", () => {
  const result = resultOf([row(2), row(3, { mesa: "M2" })], [row(4)], [{ row: 6, raw: { area: "X" }, extra: {}, issues: [{ row: 6, field: "mesa", value: null, label: "Mesa vacía", message: "m", severity: "error", code: "REQUIRED_EMPTY" }] }]);
  const model = reviewImport(result, config, []);

  it("Mantener: se crean todas y la copia apunta a su original", () => {
    const plan = planImport(result, model, { strategy: "keep", decisions: {}, includeRejected: false });
    expect(plan.toCreate.map((c) => c.row.row)).toEqual([2, 3, 4]);
    expect(plan.toCreate.find((c) => c.row.row === 4)?.duplicateOf).toEqual({ kind: "row", row: 2 });
    expect(plan.discarded).toEqual([]);
  });

  it("Eliminar duplicados: solo la primera de cada grupo; las descartadas quedan listadas", () => {
    const plan = planImport(result, model, { strategy: "remove", decisions: {}, includeRejected: false });
    expect(plan.toCreate.map((c) => c.row.row)).toEqual([2, 3]);
    expect(plan.discarded.map((d) => d.row.row)).toEqual([4]);
  });

  it("Revisar: la decisión por fila manda; sin decisión se descarta", () => {
    expect(planImport(result, model, { strategy: "review", decisions: { 4: "keep" }, includeRejected: false }).toCreate.map((c) => c.row.row)).toEqual([2, 3, 4]);
    expect(planImport(result, model, { strategy: "review", decisions: {}, includeRejected: false }).discarded).toHaveLength(1);
  });

  it("las filas con error solo se crean si la persona lo pide", () => {
    expect(planSize(planImport(result, model, { strategy: "keep", decisions: {}, includeRejected: false }))).toBe(3);
    const withFixes = planImport(result, model, { strategy: "keep", decisions: {}, includeRejected: true });
    expect(withFixes.fixes.map((f) => f.row)).toEqual([6]);
    expect(planSize(withFixes)).toBe(4);
  });
});
