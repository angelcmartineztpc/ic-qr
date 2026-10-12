import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { guardXlsx } from "@/server/excel/upload-guard";
import { importExcel } from "@/server/excel/import-excel";
import { DEFAULT_GUARD_LIMITS } from "@/server/excel/upload-guard";

/**
 * Libros generados por Excel 365, Google Sheets o LibreOffice (§S1.12): pueden
 * usar descriptores de datos u otras variantes de ZIP. Se omite si no hay archivos.
 */
const dir = join(process.cwd(), "tests/fixtures/real");
const files = readdirSync(dir).filter((f) => /\.(xlsx|csv)$/i.test(f));

describe.skipIf(files.length === 0)("libros reales", () => {
  it.each(files)("%s: el guard lo acepta y se reconocen las cabeceras", async (name) => {
    const bytes = new Uint8Array(readFileSync(join(dir, name)));
    if (/\.xlsx$/i.test(name)) expect(() => guardXlsx(bytes)).not.toThrow();
    const response = await importExcel(bytes, { fileName: name, maxRows: 5000, limits: DEFAULT_GUARD_LIMITS, defaultMenuUrl: "https://menu.example.com/lblc" });
    if (!response.ok) throw new Error(`${name}: ${response.issues.map((i) => `${i.code} ${i.message}`).join("; ")}`);
    expect(response.result.mapping.some((m) => m.field !== null)).toBe(true);
    expect(response.result.totalRows).toBeGreaterThan(0);
    console.log(name, JSON.stringify(response.result.stats), response.result.mapping.map((m) => `${m.column}:${m.header}→${m.field}`).join(" | "), "faltan:", response.result.missingColumns.join(","));
  });
});
