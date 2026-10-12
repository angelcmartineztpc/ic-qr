import * as XLSX from "xlsx";
import { afterEach, describe, expect, it, vi } from "vitest";

import { openWorkbook } from "./read-workbook";

function workbookBytes(): Uint8Array {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Área", "Mesa", "Link del menú"], ["Tropical", "M1", "https://menu.example.com/1"]]), "Piezas");
  return new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

afterEach(() => vi.unstubAllGlobals());

describe("openWorkbook sin hilos (Cloudflare Workers)", () => {
  it("lee el libro dentro de la propia petición y devuelve las mismas celdas crudas", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const reader = openWorkbook(workbookBytes());
    try {
      const sheets = await reader.scan(10);
      expect(sheets.map((sheet) => sheet.name)).toEqual(["Piezas"]);
      expect(sheets[0]?.rows[1]?.map((cell) => cell?.v)).toEqual(["Tropical", "M1", "https://menu.example.com/1"]);
      const sheet = await reader.read("Piezas", 10);
      expect(sheet.rows).toHaveLength(2);
    } finally {
      reader.close();
    }
  });
});
