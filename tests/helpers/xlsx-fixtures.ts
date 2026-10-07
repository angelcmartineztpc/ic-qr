/**
 * Fixtures de .xlsx para las pruebas de importación: libros normales escritos
 * con SheetJS y archivos hostiles armados a mano con un escritor de ZIP propio
 * (permite mentir en tamaños, añadir EOCD falsos, descriptores de datos, etc.).
 */
import { deflateSync } from "fflate";
import * as XLSX from "xlsx";

export const CONTENT_TYPES_OK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>`;

export type Cell = string | number | boolean | Date | null | { v: string; l: string } | { f: string; v?: string | number };

export interface SheetSpec {
  name: string;
  rows: Cell[][];
  hidden?: boolean;
  merges?: string[];
}

export function buildXlsx(sheets: SheetSpec[]): Uint8Array {
  const workbook = XLSX.utils.book_new();
  sheets.forEach((spec, index) => {
    const sheet = XLSX.utils.aoa_to_sheet([], { cellDates: true });
    spec.rows.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value === null) return;
        const address = XLSX.utils.encode_cell({ r, c });
        if (value instanceof Date) sheet[address] = { t: "d", v: value };
        else if (typeof value === "object" && "l" in value) sheet[address] = { t: "s", v: value.v, l: { Target: value.l } };
        else if (typeof value === "object") sheet[address] = { t: typeof value.v === "number" ? "n" : "s", f: value.f, ...(value.v === undefined ? {} : { v: value.v }) };
        else sheet[address] = { t: typeof value === "number" ? "n" : typeof value === "boolean" ? "b" : "s", v: value };
      }),
    );
    const width = Math.max(1, ...spec.rows.map((row) => row.length));
    sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, spec.rows.length - 1), c: width - 1 } });
    if (spec.merges) sheet["!merges"] = spec.merges.map((m) => XLSX.utils.decode_range(m));
    XLSX.utils.book_append_sheet(workbook, sheet, spec.name);
    if (spec.hidden) {
      workbook.Workbook ??= {};
      workbook.Workbook.Sheets ??= [];
      workbook.Workbook.Sheets[index] = { Hidden: 1 } as never;
    }
  });
  return new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer);
}

export const HEADER = ["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú (URL)", "Link del QR"];

export function menuRow(area: string, mesa: string | number, extra: Partial<Record<"estacion" | "subgrupo" | "concepto" | "menu" | "qr", string>> = {}): Cell[] {
  return [area, extra.estacion ?? "", mesa, extra.subgrupo ?? "", extra.concepto ?? "", extra.menu ?? `https://menu.example.com/${encodeURIComponent(area)}/${mesa}`, extra.qr ?? ""];
}

// ---------- escritor de ZIP "a mano" ----------

export interface RawEntry {
  name: string;
  data: Uint8Array;
  /** Método 8 (deflate) por defecto. */
  stored?: boolean;
  /** Tamaño sin comprimir que se DECLARA (para mentir). */
  declaredSize?: number;
  descriptor?: boolean;
  /** Bytes comprimidos ya hechos (para bombas). */
  compressed?: Uint8Array;
}

const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const text = (s: string) => new TextEncoder().encode(s);

function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

export function buildZip(entries: RawEntry[], options: { trailing?: Uint8Array; comment?: Uint8Array } = {}): Uint8Array {
  const parts: number[] = [];
  const central: number[] = [];
  for (const entry of entries) {
    const name = text(entry.name);
    const compressed = entry.compressed ?? (entry.stored ? entry.data : deflateSync(entry.data));
    const size = entry.declaredSize ?? entry.data.length;
    const crc = crc32(entry.data);
    const method = entry.stored ? 0 : 8;
    const flags = entry.descriptor ? 0x8 : 0;
    const offset = parts.length;
    parts.push(...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0x21));
    parts.push(...u32(entry.descriptor ? 0 : crc), ...u32(entry.descriptor ? 0 : compressed.length), ...u32(entry.descriptor ? 0 : size), ...u16(name.length), ...u16(0), ...name);
    for (const byte of compressed) parts.push(byte);
    if (entry.descriptor) parts.push(...u32(0x08074b50), ...u32(crc), ...u32(compressed.length), ...u32(size));
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(method), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(compressed.length), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name);
  }
  const comment = options.comment ?? new Uint8Array(0);
  const cdOffset = parts.length;
  const out = [...parts, ...central, ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(cdOffset), ...u16(comment.length), ...comment];
  return new Uint8Array([...out, ...(options.trailing ?? [])]);
}

/** Libro mínimo válido armado a mano (sin SheetJS) para variar la estructura del ZIP. */
export function minimalWorkbookEntries(sheetXml: string): RawEntry[] {
  return [
    { name: "[Content_Types].xml", data: text(CONTENT_TYPES_OK) },
    { name: "xl/workbook.xml", data: text(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: text(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", data: text(sheetXml) },
  ];
}

export const SHEET_XML = (rows: ReadonlyArray<ReadonlyArray<Cell>>) =>
  `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
    .map((row, r) => `<row r="${r + 1}">${row.map((v, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${String(v ?? "")}</t></is></c>`).join("")}</row>`)
    .join("")}</sheetData></worksheet>`;
