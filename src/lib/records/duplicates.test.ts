import { describe, expect, it } from "vitest";

import { DEFAULT_DUPLICATE_KEY } from "@/schemas/import";
import type { DuplicateKeyConfig, ImportedRow, ImportResult } from "@/types";

import { draft, pendingRecord } from "../../../tests/helpers/records";
import {
  applyDuplicateStrategy,
  defaultReviewDecisions,
  duplicateKey,
  findExistingDuplicate,
  findFileDuplicates,
  findProjectDuplicates,
  importDisplayStats,
} from "./duplicates";

const CONFIG: DuplicateKeyConfig = { ...DEFAULT_DUPLICATE_KEY, fields: [...DEFAULT_DUPLICATE_KEY.fields] };

const row = (n: number, overrides: Parameters<typeof draft>[0] = {}): ImportedRow => ({
  row: n,
  draft: draft(overrides),
  extra: {},
  issues: [],
  duplicateKey: "",
});

describe("duplicateKey", () => {
  it("por defecto usa los 6 campos, sin distinguir mayúsculas y con URL canónica", () => {
    const a = duplicateKey(draft({ area: "Tropical", menuUrl: "https://Menu.example.com/tropical#arriba" }), CONFIG);
    const b = duplicateKey(draft({ area: " TROPICAL ", menuUrl: "https://menu.example.com/tropical" }), CONFIG);
    expect(a).toBe(b);
    expect(duplicateKey(draft({ mesa: "M2" }), CONFIG)).not.toBe(a);
  });

  it("es configurable (campos y mayúsculas)", () => {
    const onlyMesa: DuplicateKeyConfig = { fields: ["mesa"], caseInsensitive: false, canonicalUrl: true };
    expect(duplicateKey(draft({ mesa: "m1", area: "A" }), onlyMesa)).not.toBe(duplicateKey(draft({ mesa: "M1", area: "B" }), onlyMesa));
    expect(duplicateKey(draft({ mesa: "M1", area: "A" }), onlyMesa)).toBe(duplicateKey(draft({ mesa: "M1", area: "B" }), onlyMesa));
  });
});

describe("grupos de duplicados", () => {
  const rows = [row(2), row(3, { mesa: "M2" }), row(12), row(80), row(81, { mesa: "M2" })];

  it("dentro del archivo: la primera aparición es la original", () => {
    const groups = findFileDuplicates(rows, CONFIG);
    expect(groups.map((g) => g.rows)).toEqual([[2, 12, 80], [3, 81]]);
    expect(groups.every((g) => g.scope === "file")).toBe(true);
  });

  it("contra el proyecto", () => {
    const existing = pendingRecord({ mesa: "M2" }, "existing-1");
    const groups = findProjectDuplicates(rows, [existing], CONFIG);
    expect(groups).toEqual([{ key: duplicateKey(existing, CONFIG), scope: "project", rows: [3, 81], existingRecordIds: ["existing-1"] }]);
  });

  it("alta manual: avisa si ya hay una pieza igual, ignorando la propia", () => {
    const existing = pendingRecord({}, "r9");
    expect(findExistingDuplicate(draft(), [existing], CONFIG)?.id).toBe("r9");
    expect(findExistingDuplicate(draft(), [existing], CONFIG, "r9")).toBeNull();
  });
});

describe("applyDuplicateStrategy (spec §7: nunca en silencio)", () => {
  const rows = [row(2), row(3, { mesa: "M2" }), row(12), row(80)];
  const fileGroups = findFileDuplicates(rows, CONFIG); // [2, 12, 80]
  const projectGroups = findProjectDuplicates(rows, [pendingRecord({ mesa: "M2" }, "e1")], CONFIG); // fila 3

  it("Mantener: crea todas y enlaza las copias con su original", () => {
    const outcome = applyDuplicateStrategy("keep", rows, fileGroups, projectGroups);
    expect(outcome.discarded).toEqual([]);
    expect(outcome.toCreate.map((c) => [c.row.row, c.duplicateOf])).toEqual([
      [2, undefined],
      [3, { kind: "record", recordId: "e1" }],
      [12, { kind: "row", row: 2 }],
      [80, { kind: "row", row: 2 }],
    ]);
  });

  it("Eliminar duplicados: crea solo las originales y lista las descartadas", () => {
    const outcome = applyDuplicateStrategy("remove", rows, fileGroups, projectGroups);
    expect(outcome.toCreate.map((c) => c.row.row)).toEqual([2]);
    expect(outcome.discarded.map((d) => d.row.row)).toEqual([3, 12, 80]);
  });

  it("Revisar: por defecto conserva originales; el usuario decide por fila", () => {
    const decisions = defaultReviewDecisions(rows, fileGroups, projectGroups);
    expect(decisions).toEqual({ 3: "discard", 12: "discard", 80: "discard" });
    const outcome = applyDuplicateStrategy("review", rows, fileGroups, projectGroups, { ...decisions, 80: "keep" });
    expect(outcome.toCreate.map((c) => c.row.row)).toEqual([2, 80]);
    expect(outcome.discarded.map((d) => d.row.row)).toEqual([3, 12]);
  });

  it("ninguna fila desaparece: creadas + descartadas = todas", () => {
    for (const strategy of ["keep", "remove", "review"] as const) {
      const outcome = applyDuplicateStrategy(strategy, rows, fileGroups, projectGroups);
      expect(outcome.toCreate.length + outcome.discarded.length).toBe(rows.length);
    }
  });
});

describe("importDisplayStats (invariante §C.3-10)", () => {
  it("ejemplo del spec: 248 = 240 válidas + 5 con errores + 3 duplicadas", () => {
    const result: Pick<ImportResult, "totalRows" | "stats" | "duplicateRows"> = {
      totalRows: 248,
      stats: { valid: 241, withErrors: 5, duplicates: 2, emptyRowsSkipped: 0 },
      duplicateRows: [row(80), row(81)],
    };
    // Una fila válida (la 7) duplica además una pieza del proyecto, y la 80 está en ambos grupos.
    const projectGroups = [{ key: "k", scope: "project" as const, rows: [7, 80], existingRecordIds: ["e1"] }];
    const stats = importDisplayStats(result, projectGroups);
    expect(stats).toEqual({ totalRows: 248, valid: 240, withErrors: 5, duplicates: 3 });
    expect(stats.valid + stats.withErrors + stats.duplicates).toBe(stats.totalRows);
  });
});
