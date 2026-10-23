import { describe, expect, it } from "vitest";

import { csvToSheet, CsvRejection, decodeText, detectDelimiter, looksBinary, parseCsv } from "./csv";

const limits = { maxRows: 100, maxCells: 1000, maxColumns: 50 };
const bytes = (s: string) => new TextEncoder().encode(s);

describe("detectDelimiter", () => {
  it("elige coma, punto y coma o tabulador según lo consistente", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("ignora separadores dentro de comillas", () => {
    expect(detectDelimiter('"a,b";c;d\n"1,2";3;4')).toBe(";");
  });
});

describe("parseCsv", () => {
  it("comillas, comillas dobles y saltos dentro de una celda; CRLF y filas finales sin salto", () => {
    expect(parseCsv('a,"b ""x"" c","d\ne"\r\n1,2,3', ",", limits)).toEqual([["a", 'b "x" c', "d\ne"], ["1", "2", "3"]]);
  });
  it("respeta los topes de celdas y de columnas", () => {
    expect(() => parseCsv("a,b,c\n".repeat(10), ",", { ...limits, maxCells: 5 })).toThrow(CsvRejection);
    expect(() => parseCsv("a,b,c,d", ",", { ...limits, maxColumns: 3 })).toThrow(CsvRejection);
  });
  it("deja de leer al llegar a maxRows", () => {
    expect(parseCsv("1\n2\n3\n4\n5\n", ",", { ...limits, maxRows: 3 })).toHaveLength(3);
  });
});

describe("decodeText y looksBinary", () => {
  it("UTF-8 con BOM, y Windows-1252 cuando no es UTF-8 válido", () => {
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes("Área")]))).toBe("Área");
    expect(decodeText(Uint8Array.from(Buffer.from("Estación", "latin1")))).toBe("Estación");
  });
  it("detecta binarios (NUL o demasiados caracteres de control)", () => {
    expect(looksBinary(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00, 0x01]))).toBe(true);
    expect(looksBinary(bytes("area,mesa\nBar,1\n"))).toBe(false);
  });
});

describe("csvToSheet", () => {
  it("devuelve una hoja con celdas vacías como null y sin filas finales vacías", () => {
    const sheet = csvToSheet(bytes("area,mesa,concepto\nBar,,x\n\n\n"), limits);
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[1]).toEqual([{ t: "s", v: "Bar", w: "Bar" }, null, { t: "s", v: "x", w: "x" }]);
  });
  it("rechaza un archivo binario", () => {
    expect(() => csvToSheet(Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0, 1, 2, 3, 0]), limits)).toThrow(CsvRejection);
  });
});
