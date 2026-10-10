import { describe, expect, it } from "vitest";

import { acknowledgeQr } from "@/lib/records/factory";

import { existingRecord, generatedRecord, MENU, pendingRecord } from "../../../tests/helpers/records";
import { countRecords, matchesFilter, matchesQuery, paginate } from "./counters";

const records = () => [
  generatedRecord({ id: "g1" }),
  existingRecord({ id: "e1" }),
  pendingRecord({}, "p1"),
  generatedRecord({ id: "s1", menuUrl: "https://menu.example.com/otro" }), // stale
  { ...pendingRecord({ mesa: "" }, "bad"), qrStatus: "pending" as const },
];

describe("countRecords (spec §37: el usuario siempre sabe cuántas piezas y cuáles necesitan QR)", () => {
  it("cuenta total, con QR, que necesitan QR, con errores y exportables", () => {
    const list = records();
    const counts = countRecords(list);
    // La pieza con la mesa vacía ya sale de createRecord con su error de validación.
    expect(counts).toMatchObject({ total: 5, withQr: 2, generated: 1, existing: 1, needQr: 3, withErrors: 1, exportable: 2 });
  });

  it("un stale confirmado cuenta como con QR; sin confirmar, como que necesita QR", () => {
    const stale = generatedRecord({ id: "s1", menuUrl: "https://menu.example.com/otro" });
    expect(countRecords([stale]).needQr).toBe(1);
    expect(countRecords([acknowledgeQr(stale, "stale", "2026-10-06T10:00:00.000Z")]).withQr).toBe(1);
  });

  it("piezas con errores de validación y excluidas", () => {
    const bad = { ...generatedRecord({ id: "b" }), validationErrors: [{ field: "mesa" as const, code: "REQUIRED_EMPTY", message: "x", severity: "error" as const }] };
    const counts = countRecords([bad, generatedRecord({ id: "ok" })], new Set(["ok"]));
    expect(counts).toMatchObject({ withErrors: 1, exportable: 1, excluded: 1 });
  });

  it("lista vacía", () => {
    expect(countRecords([])).toEqual({ total: 0, withErrors: 0, withQr: 0, needQr: 0, generated: 0, existing: 0, exportable: 0, excluded: 0 });
  });
});

describe("filtros y búsqueda", () => {
  it("cada contador es un filtro de la lista", () => {
    const list = records();
    const ids = (filter: Parameters<typeof matchesFilter>[1]) => list.filter((r) => matchesFilter(r, filter)).map((r) => r.id);
    expect(ids("all")).toHaveLength(5);
    expect(ids("withQr")).toEqual(["g1", "e1"]);
    expect(ids("needQr")).toEqual(["p1", "s1", "bad"]);
    expect(list.filter((r) => matchesFilter(r, "excluded", new Set(["p1"]))).map((r) => r.id)).toEqual(["p1"]);
  });

  it("busca en todos los campos sin distinguir mayúsculas ni acentos", () => {
    const record = pendingRecord({ area: "Terraza Ñandú", mesa: "VIP-A", concepto: "Menú infantil" });
    for (const q of ["terraza", "NANDU", "vip", "menu infantil", MENU.slice(8, 20), ""]) expect(matchesQuery(record, q), q).toBe(true);
    expect(matchesQuery(record, "inexistente")).toBe(false);
  });
});

describe("paginate (Página N de M)", () => {
  const items = Array.from({ length: 50 }, (_, i) => i);
  it("devuelve la página pedida y limita al rango válido", () => {
    expect(paginate(items, 1, 24)).toMatchObject({ page: 1, pages: 3, items: items.slice(0, 24) });
    expect(paginate(items, 3, 24).items).toEqual([48, 49]);
    expect(paginate(items, 99, 24).page).toBe(3);
    expect(paginate(items, -4, 24).page).toBe(1);
    expect(paginate([], 1, 24)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
