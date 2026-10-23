import { describe, expect, it } from "vitest";

import { fileIssueStatus } from "@/services/qr-produccion/excel/file-issues";

import { buildXlsx, HEADER, menuRow } from "../test-helpers/xlsx-fixtures";
import { decodeFileName, importExcel, type ImportOptions } from "./import-excel";
import { decodeBase64Url, parseImportHeaders } from "./import-request";
import type { WorkbookReader } from "./workbook-reader";

const b64url = (text: string) => {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

describe("parseImportHeaders", () => {
  it("sin cabeceras, nada", () => {
    expect(parseImportHeaders(new Headers(), 5000)).toEqual({ columns: undefined, sheet: undefined, truncateTo: undefined, defaultMenuUrl: undefined });
  });

  it("lee el mapeo (base64url con acentos), la hoja, el recorte y el link por defecto", () => {
    const headers = new Headers({ "x-column-mapping": b64url(JSON.stringify({ sheet: "Menú", columns: { A: "area", C: null } })), "x-import-truncate": "100", "x-default-menu-url": encodeURIComponent("https://menu.example.com/a?b=1") });
    expect(parseImportHeaders(headers, 5000)).toEqual({ columns: { A: "area", C: null }, sheet: "Menú", truncateTo: 100, defaultMenuUrl: "https://menu.example.com/a?b=1" });
  });

  it.each([
    ["mapeo que no es base64url/JSON", { "x-column-mapping": "***" }],
    ["mapeo con un campo repetido", { "x-column-mapping": b64url(JSON.stringify({ columns: { A: "area", B: "area" } })) }],
    ["mapeo con un campo desconocido", { "x-column-mapping": b64url(JSON.stringify({ columns: { A: "nope" } })) }],
    ["recorte no entero", { "x-import-truncate": "1.5" }],
    ["recorte mayor que el máximo", { "x-import-truncate": "5001" }],
    ["link por defecto mal codificado", { "x-default-menu-url": "%E0%A4%A" }],
  ])("400 con %s", (_name, headers) => {
    expect(() => parseImportHeaders(new Headers(headers), 5000)).toThrowError(expect.objectContaining({ status: 400, code: "VALIDATION_FAILED" }));
  });

  it("decodeBase64Url admite la variante sin relleno", () => {
    expect(new TextDecoder().decode(decodeBase64Url(b64url("hola ñ")))).toBe("hola ñ");
  });
});

describe("importExcel con un lector de libros inyectado", () => {
  const limits = { maxEntries: 2000, maxEntryInflated: 20_000_000, maxTotalInflated: 40_000_000, maxCells: 300_000, maxRatio: 200 };
  const sheet = { name: "Mesas", state: "visible" as const, rows: [HEADER, menuRow("Tropical", 1), menuRow("Tropical", 2)].map((row) => row.map((v) => (v === "" || v === null ? null : { t: typeof v === "number" ? "n" : "s", v }))), merges: [], rowCount: 3, colCount: 7 };
  const reader: WorkbookReader = { scan: async () => [sheet] as never, read: async () => sheet as never, close: () => undefined };
  const options = (overrides: Partial<ImportOptions> = {}): ImportOptions => ({ fileName: "mesas.xlsx", maxRows: 5000, limits, openWorkbook: () => reader, ...overrides });

  it("pasa por el guard del contenedor y lee las filas con el lector inyectado", async () => {
    const response = await importExcel(buildXlsx([{ name: "Mesas", rows: [HEADER, menuRow("Tropical", 1)] }]), options());
    expect(response.ok).toBe(true);
    if (response.ok) expect(response.result.successful.map((r) => r.draft.mesa)).toEqual(["1", "2"]);
  });

  it("un archivo hostil se rechaza ANTES de abrir el libro (el lector ni se crea)", async () => {
    let opened = false;
    const response = await importExcel(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), options({ openWorkbook: () => ((opened = true), reader) }));
    expect(response.ok).toBe(false);
    expect(opened).toBe(false);
    if (!response.ok) expect(fileIssueStatus(response.issues[0]?.code ?? "NOT_XLSX")).toBe(422);
  });

  it("un CSV no pasa por el lector de libros", async () => {
    let opened = false;
    const csv = new TextEncoder().encode("Área,Mesa,Link del menú (URL)\nTropical,1,https://menu.example.com/a\n");
    const response = await importExcel(csv, options({ openWorkbook: () => ((opened = true), reader) }));
    expect(opened).toBe(false);
    expect(response.ok).toBe(true);
  });

  it("cierra el lector aunque falle", async () => {
    let closed = false;
    const failing: WorkbookReader = { scan: async () => { throw new Error("boom"); }, read: async () => sheet as never, close: () => { closed = true; } };
    await expect(importExcel(buildXlsx([{ name: "Mesas", rows: [HEADER, menuRow("T", 1)] }]), options({ openWorkbook: () => failing }))).rejects.toThrow("boom");
    expect(closed).toBe(true);
  });

  it("decodeFileName limpia caracteres de control y tolera codificación inválida", () => {
    expect(decodeFileName(encodeURIComponent("Menú mesas.xlsx"))).toBe("Menú mesas.xlsx");
    expect(decodeFileName("%E0%A4%A")).toBe("%E0%A4%A");
    expect(decodeFileName(null)).toBe("archivo.xlsx");
  });
});
