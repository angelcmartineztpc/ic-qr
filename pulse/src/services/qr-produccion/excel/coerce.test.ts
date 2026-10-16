import { describe, expect, it } from "vitest";

import { coerceCell, formatNumber } from "./coerce";

describe("formatNumber", () => {
  it("enteros sin decimales y decimales a 15 dígitos", () => {
    expect(formatNumber(1)).toBe("1");
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(1234567890123)).toBe("1234567890123");
  });
});

describe("coerceCell", () => {
  const plain = { url: false };
  const url = { url: true };

  it("celda vacía → texto vacío", () => {
    expect(coerceCell(null, plain)).toEqual({ text: "", notes: [] });
  });

  it("número entero de una mesa: 1 en lugar de «1.0»", () => {
    expect(coerceCell({ t: "n", v: 1, w: "1.0" }, plain)).toEqual({ text: "1", notes: [] });
  });

  it("fecha → ISO con aviso DATE_CELL", () => {
    const out = coerceCell({ t: "d", v: "2026-01-02", w: "1/2/26" }, plain);
    expect(out.text).toBe("2026-01-02");
    expect(out.notes[0]).toMatchObject({ code: "DATE_CELL", severity: "warning" });
  });

  it("booleano → TRUE/FALSE con aviso", () => {
    expect(coerceCell({ t: "b", v: true }, plain)).toMatchObject({ text: "TRUE", notes: [{ code: "BOOLEAN_CELL" }] });
  });

  it("error de Excel → error de celda", () => {
    expect(coerceCell({ t: "e", v: 42, w: "#N/A" }, plain)).toMatchObject({ text: "", notes: [{ code: "CELL_ERROR", severity: "error", detail: "#N/A" }] });
  });

  it("fórmula sin valor guardado → aviso", () => {
    expect(coerceCell({ t: "s", f: "A1&B1" }, plain)).toMatchObject({ text: "", notes: [{ code: "FORMULA_NO_CACHED_VALUE" }] });
  });

  it("hipervínculo: usa el destino y avisa si el texto visible era otra URL", () => {
    const out = coerceCell({ t: "s", v: "https://visible.com", l: "https://real.com/menu" }, url);
    expect(out.text).toBe("https://real.com/menu");
    expect(out.notes[0]).toMatchObject({ code: "HYPERLINK_TEXT_MISMATCH" });
  });

  it("hipervínculo con texto descriptivo: usa el destino sin avisar", () => {
    expect(coerceCell({ t: "s", v: "Ver menú", l: "https://real.com/menu" }, url)).toEqual({ text: "https://real.com/menu", notes: [] });
  });

  it("en campos que no son URL el enlace no reemplaza al texto", () => {
    expect(coerceCell({ t: "s", v: "M1", l: "https://real.com" }, plain).text).toBe("M1");
  });

  it('=HYPERLINK("literal"): extrae el literal; con referencias avisa', () => {
    expect(coerceCell({ t: "s", v: "Ver", f: 'HYPERLINK("https://a.com/x","Ver")' }, url).text).toBe("https://a.com/x");
    const unresolved = coerceCell({ t: "s", v: "https://c.com", f: "HYPERLINK(C2)" }, url);
    expect(unresolved.text).toBe("https://c.com");
    expect(unresolved.notes[0]).toMatchObject({ code: "HYPERLINK_FORMULA_UNRESOLVED" });
  });
});
