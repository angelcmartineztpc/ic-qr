import { deflateSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildXlsx, buildZip, CONTENT_TYPES_OK, HEADER, menuRow, minimalWorkbookEntries, SHEET_XML } from "../../../tests/helpers/xlsx-fixtures";
import { DEFAULT_GUARD_LIMITS, guardXlsx, ImportRejection } from "./upload-guard";

const code = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof ImportRejection) return error.code;
    throw error;
  }
};
const text = (s: string) => new TextEncoder().encode(s);
const goodSheet = SHEET_XML([HEADER, menuRow("Tropical", 1)]);

describe("guardXlsx: archivos legítimos", () => {
  it("acepta un libro escrito con SheetJS y devuelve un ZIP limpio", () => {
    const guarded = guardXlsx(buildXlsx([{ name: "Mesas", rows: [HEADER, menuRow("Tropical", 1)] }]));
    expect(guarded.cells).toBeGreaterThan(5);
    expect(guarded.zip.length).toBeGreaterThan(100);
  });

  it("acepta entradas con descriptor de datos (Google Sheets, algunas versiones de Excel)", () => {
    const zip = buildZip(minimalWorkbookEntries(goodSheet).map((e) => ({ ...e, descriptor: true })));
    expect(code(() => guardXlsx(zip))).toBeNull();
  });

  it("acepta entradas sin comprimir (método 0)", () => {
    const zip = buildZip(minimalWorkbookEntries(goodSheet).map((e) => ({ ...e, stored: true })));
    expect(code(() => guardXlsx(zip))).toBeNull();
  });
});

describe("guardXlsx: formatos que no se admiten", () => {
  it("rechaza lo que no es un ZIP", () => {
    expect(code(() => guardXlsx(text("a,b,c\n1,2,3\n".repeat(20))))).toBe("NOT_A_ZIP");
    expect(code(() => guardXlsx(text("<html><body>tabla</body></html>".repeat(5))))).toBe("NOT_A_ZIP");
  });

  it("rechaza .xls antiguo o cifrado (OLE) con su mensaje", () => {
    const ole = new Uint8Array(512);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(code(() => guardXlsx(ole))).toBe("LEGACY_XLS_OR_ENCRYPTED");
  });

  it.each([
    ["macros por content type", "application/vnd.ms-excel.sheet.macroEnabled.main+xml", "MACRO_ENABLED"],
    ["plantilla", "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml", "TEMPLATE_FILE"],
    ["otro tipo", "application/vnd.ms-excel.sheet.binary.macroEnabled.main", "NOT_XLSX"],
  ])("rechaza %s", (_name, contentType, expected) => {
    const entries = minimalWorkbookEntries(goodSheet);
    entries[0] = { name: "[Content_Types].xml", data: text(CONTENT_TYPES_OK.replace(/ContentType="[^"]*"/, `ContentType="${contentType}"`)) };
    expect(code(() => guardXlsx(buildZip(entries)))).toBe(expected);
  });

  it("rechaza vbaProject.bin y workbook.bin", () => {
    expect(code(() => guardXlsx(buildZip([...minimalWorkbookEntries(goodSheet), { name: "xl/vbaProject.bin", data: text("x") }])))).toBe("MACRO_ENABLED");
    expect(code(() => guardXlsx(buildZip([...minimalWorkbookEntries(goodSheet), { name: "xl/workbook.bin", data: text("x") }])))).toBe("XLSB_UNSUPPORTED");
  });

  it("rechaza un ZIP que no es un libro de Excel", () => {
    expect(code(() => guardXlsx(buildZip([{ name: "hola.txt", data: text("hola mundo") }])))).toBe("NOT_XLSX");
  });
});

describe("guardXlsx: archivos hostiles", () => {
  it("rechaza datos añadidos después del EOCD (EOCD falso al final)", () => {
    const real = buildXlsx([{ name: "Mesas", rows: [HEADER, menuRow("Tropical", 1)] }]);
    const fake = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // El EOCD falso queda como «el último»: apunta a un directorio vacío y no es un libro.
    expect(code(() => guardXlsx(new Uint8Array([...real, ...fake])))).toBe("NOT_XLSX");
    expect(code(() => guardXlsx(new Uint8Array([...real, 1, 2, 3])))).toBe("ZIP_CORRUPT");
  });

  it("rechaza bytes sin declarar entre las entradas", () => {
    const entries = minimalWorkbookEntries(goodSheet);
    const zip = buildZip(entries);
    const injected = new Uint8Array([...zip.subarray(0, 40), 0, 0, 0, 0, ...zip.subarray(40)]);
    expect(code(() => guardXlsx(injected))).not.toBeNull();
  });

  it("rechaza una bomba de descompresión por ratio declarado", () => {
    const big = new Uint8Array(15 * 1024 * 1024);
    const zip = buildZip([...minimalWorkbookEntries(goodSheet).slice(0, 3), { name: "xl/worksheets/sheet1.xml", data: big }]);
    expect(code(() => guardXlsx(zip))).toBe("ZIP_BOMB");
  });

  it("rechaza una bomba que MIENTE sobre su tamaño (declara poco, infla mucho)", () => {
    const real = new Uint8Array(3 * 1024 * 1024);
    const entries = minimalWorkbookEntries(goodSheet).slice(0, 3);
    const zip = buildZip([...entries, { name: "xl/worksheets/sheet1.xml", data: real, compressed: deflateSync(real), declaredSize: 2000 }]);
    expect(code(() => guardXlsx(zip))).toBe("ZIP_SIZE_MISMATCH");
  });

  it("rechaza entradas que superan el máximo inflado por entrada", () => {
    const entries = minimalWorkbookEntries(goodSheet).slice(0, 3);
    const zip = buildZip([...entries, { name: "xl/worksheets/sheet1.xml", data: text("x".repeat(50_000)) }]);
    expect(code(() => guardXlsx(zip, { ...DEFAULT_GUARD_LIMITS, maxEntryInflated: 10_000 }))).toBe("ZIP_BOMB");
  });

  it("rechaza demasiadas celdas", () => {
    const rows = Array.from({ length: 50 }, () => ["a", "b", "c", "d"]);
    const zip = buildZip(minimalWorkbookEntries(SHEET_XML(rows)));
    expect(code(() => guardXlsx(zip, { ...DEFAULT_GUARD_LIMITS, maxCells: 100 }))).toBe("TOO_MANY_CELLS");
  });

  it("rechaza demasiados componentes", () => {
    const zip = buildZip([...minimalWorkbookEntries(goodSheet), ...Array.from({ length: 30 }, (_, i) => ({ name: `extra/${i}.xml`, data: text("<a/>") }))]);
    expect(code(() => guardXlsx(zip, { ...DEFAULT_GUARD_LIMITS, maxEntries: 10 }))).toBe("ZIP_TOO_MANY_ENTRIES");
  });

  it("rechaza un descriptor de datos que no coincide con el directorio central", () => {
    const entries = minimalWorkbookEntries(goodSheet).map((e) => ({ ...e, descriptor: true }));
    const zip = buildZip(entries);
    // El primer descriptor: se cambia el tamaño comprimido por otro.
    const view = new DataView(zip.buffer);
    let p = 0;
    for (; p < zip.length - 4; p++) if (view.getUint32(p, true) === 0x08074b50) break;
    view.setUint32(p + 8, 1, true);
    expect(code(() => guardXlsx(zip))).not.toBeNull();
  });

  it("no se deja engañar por un nombre local distinto al del directorio central", () => {
    const zip = buildZip(minimalWorkbookEntries(goodSheet));
    const view = new DataView(zip.buffer);
    // Cambia el primer carácter del nombre local de la primera entrada.
    zip[30] = 0x58;
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(code(() => guardXlsx(zip))).toBe("ZIP_CORRUPT");
  });

  it("rechaza ZIP cifrado (flag de cifrado)", () => {
    const zip = buildZip(minimalWorkbookEntries(goodSheet));
    new DataView(zip.buffer).setUint16(6, 1, true);
    expect(code(() => guardXlsx(zip))).not.toBeNull();
  });
});
