import { describe, expect, it } from "vitest";

import { chooseSheet, detectHeaderRow, levenshtein, mapHeaderRow, matchHeader, normalizeHeader } from "./headers";
import type { RawCell, RawSheet } from "./types";

const s = (v: string): RawCell => ({ t: "s", v, w: v });
const row = (...values: string[]) => values.map(s);

describe("normalizeHeader", () => {
  it("quita acentos, paréntesis, mayúsculas y símbolos", () => {
    expect(normalizeHeader("Link del menú (URL)")).toBe("linkdelmenu");
    expect(normalizeHeader("No. Mesa")).toBe("nomesa");
    expect(normalizeHeader("  SUB-GRUPO ")).toBe("subgrupo");
    expect(normalizeHeader("Área")).toBe("area");
  });
});

describe("matchHeader", () => {
  it.each([
    ["Área", "area"],
    ["Restaurante", "area"],
    ["Estación", "estacion"],
    ["No. Mesa", "mesa"],
    ["# Mesa", "mesa"],
    ["Sub-grupo", "subgrupo"],
    ["Concepto", "concepto"],
    ["Link del menú (URL)", "menuUrl"],
    ["Link del QR", "qrUrl"],
    ["QR", "qrUrl"],
  ])("«%s» → %s (exacta)", (header, field) => {
    expect(matchHeader(header)).toMatchObject({ field, match: "exact" });
  });

  it("acepta erratas pequeñas como aproximadas", () => {
    expect(matchHeader("Concpto")).toMatchObject({ field: "concepto", match: "fuzzy" });
    expect(matchHeader("Link del menu digital")).toMatchObject({ field: "menuUrl", match: "fuzzy" });
  });

  it("no adivina en palabras cortas (presupuesto 0)", () => {
    expect(matchHeader("mesx")).toMatchObject({ field: null });
    expect(matchHeader("Notas")).toMatchObject({ field: null, match: "none" });
  });

  it("veto cruzado: una cabecera que nombra dos campos es ambigua", () => {
    const m = matchHeader("Link QR del menú");
    expect(m.match).toBe("ambiguous");
    expect(m.candidates).toEqual(expect.arrayContaining(["qrUrl", "menuUrl"]));
  });

  it("una cabecera vacía no es nada", () => {
    expect(matchHeader("   ")).toEqual({ field: null, match: "none" });
  });
});

describe("levenshtein", () => {
  it("calcula distancias y corta al pasar el límite", () => {
    expect(levenshtein("mesa", "mesa")).toBe(0);
    expect(levenshtein("concepto", "concpto")).toBe(1);
    expect(levenshtein("abc", "xyzxyz", 2)).toBeGreaterThan(2);
  });
});

describe("mapHeaderRow", () => {
  it("con dos columnas para el mismo campo gana la exacta; la otra queda ambigua", () => {
    const mapping = mapHeaderRow(row("Link del menú", "Link menu digital", "Área", "Mesa"));
    expect(mapping.filter((m) => m.field === "menuUrl")).toHaveLength(1);
    expect(mapping[0]).toMatchObject({ column: "A", field: "menuUrl", match: "exact" });
    expect(mapping[1]).toMatchObject({ column: "B", field: null, match: "ambiguous", candidates: ["menuUrl"] });
  });

  it("usa letras de columna reales (Z, AA)", () => {
    const cells = Array.from({ length: 28 }, (_, i) => (i === 27 ? s("Área") : null));
    expect(mapHeaderRow(cells)[0]?.column).toBe("AB");
  });
});

describe("detectHeaderRow y chooseSheet", () => {
  const titled = [row("REPORTE DE MESAS 2026"), [], row("Área", "Mesa", "Link del menú"), row("Tropical", "M1", "https://x.com")];

  it("encuentra la cabecera aunque haya un título encima", () => {
    expect(detectHeaderRow(titled)).toMatchObject({ rowIndex: 2, score: 3 });
  });

  it("exige al menos 3 campos reconocidos", () => {
    expect(detectHeaderRow([row("Área", "Mesa")])).toBeNull();
  });

  const sheet = (name: string, rows: RawCell[][], state: RawSheet["state"] = "visible"): RawSheet => ({ name, state, rows, merges: [], rowCount: rows.length, colCount: 3 });

  it("elige la hoja visible con mejor puntuación e ignora las de instrucciones y las ocultas", () => {
    const sheets = [sheet("Instrucciones", [row("Llena la hoja siguiente")]), sheet("Oculta", titled, "hidden"), sheet("Datos", titled)];
    expect(chooseSheet(sheets)?.sheet.name).toBe("Datos");
  });

  it("devuelve null si ninguna hoja tiene cabeceras", () => {
    expect(chooseSheet([sheet("A", [row("x", "y", "z")])])).toBeNull();
  });
});
