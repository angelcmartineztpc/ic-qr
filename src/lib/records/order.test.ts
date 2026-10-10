import { describe, expect, it } from "vitest";

import type { QRRecord } from "@/types";

import { pendingRecord } from "../../../tests/helpers/records";
import { compareNatural } from "./natural-sort";
import { insertAfter, isPermutation, materializeOrder, moveTo, moveToEnd, moveToStart, removeIds, repairOrder, sortOrder } from "./order";

const ids = ["a", "b", "c", "d"];

describe("order", () => {
  it("moveTo / inicio / final", () => {
    expect(moveTo(ids, "d", 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveToStart(ids, "c")).toEqual(["c", "a", "b", "d"]);
    expect(moveToEnd(ids, "a")).toEqual(["b", "c", "d", "a"]);
    expect(moveTo(ids, "z", 0)).toEqual(ids);
    expect(moveTo(ids, "a", 99)).toEqual(["b", "c", "d", "a"]);
  });

  it("mover la pieza 240 a la posición 1 con 1000 piezas", () => {
    const many = Array.from({ length: 1000 }, (_, i) => `r${i + 1}`);
    const moved = moveToStart(many, "r240");
    expect(moved[0]).toBe("r240");
    expect(moved).toHaveLength(1000);
    expect(isPermutation(moved, many)).toBe(true);
  });

  it("insertAfter y removeIds", () => {
    expect(insertAfter(ids, ["x", "y"], "b")).toEqual(["a", "b", "x", "y", "c", "d"]);
    expect(insertAfter(ids, ["x", "a"])).toEqual([...ids, "x"]);
    expect(removeIds(ids, ["b", "d"])).toEqual(["a", "c"]);
  });

  it("orden natural en español: M2 < M10, sin acentos ni mayúsculas", () => {
    expect(["M10", "m2", "M1"].sort(compareNatural)).toEqual(["M1", "m2", "M10"]);
    expect(compareNatural("Área", "area")).toBe(0);
  });

  it("sortOrder por mesa y por fila de Excel (estable)", () => {
    const records: Record<string, QRRecord> = {
      a: pendingRecord({ mesa: "M10" }, "a"),
      b: pendingRecord({ mesa: "M2" }, "b"),
      c: { ...pendingRecord({ mesa: "M2" }, "c"), metadata: { origin: "excel", sourceRow: 3 } },
    };
    expect(sortOrder(["a", "b", "c"], records, "mesa")).toEqual(["b", "c", "a"]);
    expect(sortOrder(["a", "b", "c"], records, "sourceRow")).toEqual(["c", "a", "b"]);
  });

  it("repairOrder garantiza una permutación y materializeOrder fija record.order", () => {
    const records: Record<string, QRRecord> = {
      a: { ...pendingRecord({}, "a"), order: 5 },
      b: { ...pendingRecord({}, "b"), order: 1 },
      c: { ...pendingRecord({}, "c"), order: 0 },
    };
    const repaired = repairOrder(["b", "x", "b"], records);
    expect(repaired).toEqual(["b", "c", "a"]);
    expect(isPermutation(repaired, Object.keys(records))).toBe(true);
    expect(materializeOrder(repaired, records).map((r) => [r.id, r.order])).toEqual([
      ["b", 0],
      ["c", 1],
      ["a", 2],
    ]);
  });
});
