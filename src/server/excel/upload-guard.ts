import "server-only";

import { Inflate, zipSync, type Zippable } from "fflate";

import { fileIssue } from "@/lib/excel/file-issues";
import type { ImportIssue, ImportIssueCode } from "@/types";

/**
 * Guard del contenedor .xlsx (docs/ARCHITECTURE.md §S1.2). Se ejecuta ANTES de
 * SheetJS y es estricto: SheetJS solo recibe el ZIP limpio que se reconstruye a
 * partir de los bytes que este guard midió, así que no puede seguir un
 * directorio central oculto (EOCD falso) ni inflar más de lo contado.
 */
export class ImportRejection extends Error {
  constructor(
    readonly code: ImportIssueCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "ImportRejection";
  }
  toIssue(): ImportIssue {
    return fileIssue(this.code, this.detail);
  }
}

export interface GuardLimits {
  maxEntries: number;
  maxEntryInflated: number;
  maxTotalInflated: number;
  maxCells: number;
  /** Relación máxima inflado/comprimido para entradas grandes. */
  maxRatio: number;
}

export const DEFAULT_GUARD_LIMITS: GuardLimits = { maxEntries: 2000, maxEntryInflated: 20 * 1024 * 1024, maxTotalInflated: 40 * 1024 * 1024, maxCells: 300_000, maxRatio: 200 };

export interface GuardedWorkbook {
  /** ZIP reconstruido (sin compresión) que es lo único que ve SheetJS. */
  zip: Uint8Array;
  entryCount: number;
  inflatedBytes: number;
  /** Celdas contadas en todas las hojas (apariciones de `<c `). */
  cells: number;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_DESCRIPTOR = 0x08074b50;
const EOCD_SIZE = 22;
const LARGE_ENTRY = 1024 * 1024;

const WORKBOOK_MAIN = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const WORKBOOK_MACRO = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";
const WORKBOOK_TEMPLATE = "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml";
const WORKBOOK_TEMPLATE_MACRO = "application/vnd.ms-excel.template.macroEnabled.main+xml";

interface CentralEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

function reject(code: ImportIssueCode, detail?: string): never {
  throw new ImportRejection(code, detail);
}

export function guardXlsx(bytes: Uint8Array, limits: GuardLimits = DEFAULT_GUARD_LIMITS): GuardedWorkbook {
  if (bytes.length < EOCD_SIZE + 4) reject("NOT_A_ZIP");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Firma del archivo. OLE (.xls antiguo o cifrado) tiene su propio mensaje.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) reject("LEGACY_XLS_OR_ENCRYPTED");
  if (view.getUint32(0, true) !== SIG_LOCAL) reject("NOT_A_ZIP");

  // EOCD: la ÚLTIMA firma del archivo, y debe terminar exactamente donde acaba el archivo.
  let eocd = -1;
  for (let i = bytes.length - 4; i >= 0; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0 || eocd + EOCD_SIZE > bytes.length) reject("ZIP_CORRUPT");
  const commentLength = view.getUint16(eocd + 20, true);
  if (eocd + EOCD_SIZE + commentLength !== bytes.length) reject("ZIP_CORRUPT", "Hay datos añadidos al final del archivo");

  const disk = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || cdDisk !== 0 || entriesOnDisk !== entryCount) reject("ZIP_CORRUPT");
  if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) reject("ZIP_CORRUPT", "ZIP64 no se admite");
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === SIG_ZIP64_LOCATOR) reject("ZIP_CORRUPT", "ZIP64 no se admite");
  if (entryCount === 0) reject("NOT_XLSX");
  if (entryCount > limits.maxEntries) reject("ZIP_TOO_MANY_ENTRIES");
  if (cdOffset + cdSize !== eocd) reject("ZIP_CORRUPT");

  // Directorio central.
  const decoder = new TextDecoder("utf-8");
  const central: CentralEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > eocd || view.getUint32(p, true) !== SIG_CENTRAL) reject("ZIP_CORRUPT");
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compressedSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLength = view.getUint16(p + 28, true);
    const extraLength = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const entryDisk = view.getUint16(p + 34, true);
    const localOffset = view.getUint32(p + 42, true);
    if (p + 46 + nameLength + extraLength + commentLen > eocd) reject("ZIP_CORRUPT");
    if (flags & 0x1 || flags & 0x40) reject("LEGACY_XLS_OR_ENCRYPTED");
    if (method !== 0 && method !== 8) reject("ZIP_CORRUPT", "Método de compresión no admitido");
    if (entryDisk !== 0 || compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) reject("ZIP_CORRUPT", "ZIP64 no se admite");
    if (method === 0 && compressedSize !== size) reject("ZIP_SIZE_MISMATCH");
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (name.length === 0 || name.length > 512 || name.includes("\0")) reject("ZIP_CORRUPT");
    central.push({ name, flags, method, crc, compressedSize, size, localOffset });
    p += 46 + nameLength + extraLength + commentLen;
  }
  if (p !== eocd) reject("ZIP_CORRUPT");
  if (new Set(central.map((e) => e.name)).size !== central.length) reject("ZIP_CORRUPT", "Hay componentes repetidos");

  // Cabeceras locales = directorio central; entradas contiguas que cubren [0, cdOffset).
  const dataStart = new Map<CentralEntry, number>();
  let cursor = 0;
  for (const entry of [...central].sort((a, b) => a.localOffset - b.localOffset)) {
    if (entry.localOffset !== cursor || entry.localOffset + 30 > cdOffset) reject("ZIP_CORRUPT");
    const o = entry.localOffset;
    if (view.getUint32(o, true) !== SIG_LOCAL) reject("ZIP_CORRUPT");
    const flags = view.getUint16(o + 6, true);
    const method = view.getUint16(o + 8, true);
    const nameLength = view.getUint16(o + 26, true);
    const extraLength = view.getUint16(o + 28, true);
    const localName = decoder.decode(bytes.subarray(o + 30, o + 30 + nameLength));
    if (localName !== entry.name || method !== entry.method || flags !== entry.flags) reject("ZIP_CORRUPT", "La cabecera local no coincide con el directorio");
    const hasDescriptor = (entry.flags & 0x8) !== 0;
    if (!hasDescriptor && (view.getUint32(o + 18, true) !== entry.compressedSize || view.getUint32(o + 22, true) !== entry.size)) reject("ZIP_SIZE_MISMATCH");
    const start = o + 30 + nameLength + extraLength;
    let end = start + entry.compressedSize;
    if (end > cdOffset) reject("ZIP_CORRUPT");
    if (hasDescriptor) {
      // Con descriptor de datos (Google Sheets, algunas versiones de Excel) los tamaños reales van detrás de los datos y se comprueban contra el directorio central.
      let d = end;
      if (d + 4 <= cdOffset && view.getUint32(d, true) === SIG_DESCRIPTOR) d += 4;
      if (d + 12 > cdOffset) reject("ZIP_CORRUPT");
      if (view.getUint32(d, true) !== entry.crc || view.getUint32(d + 4, true) !== entry.compressedSize || view.getUint32(d + 8, true) !== entry.size) reject("ZIP_SIZE_MISMATCH");
      end = d + 12;
    }
    dataStart.set(entry, start);
    cursor = end;
  }
  if (cursor !== cdOffset) reject("ZIP_CORRUPT", "Hay datos sin declarar dentro del archivo");

  // Componentes que no se admiten, antes de inflar nada.
  for (const { name } of central) {
    const lower = name.toLowerCase();
    if (lower === "xl/vbaproject.bin") reject("MACRO_ENABLED");
    if (lower === "xl/workbook.bin") reject("XLSB_UNSUPPORTED");
  }
  if (!central.some((e) => e.name === "[Content_Types].xml") || !central.some((e) => e.name === "xl/workbook.xml")) reject("NOT_XLSX");

  // Tamaños declarados.
  let declaredTotal = 0;
  for (const e of central) {
    if (e.size > limits.maxEntryInflated) reject("ZIP_BOMB");
    if (e.size > LARGE_ENTRY && e.size / Math.max(1, e.compressedSize) > limits.maxRatio) reject("ZIP_BOMB");
    declaredTotal += e.size;
    if (declaredTotal > limits.maxTotalInflated) reject("ZIP_BOMB");
  }

  // Inflado en streaming con salida de tamaño fijo, contando bytes reales.
  const output: Zippable = {};
  let inflated = 0;
  let cells = 0;
  let contentTypes = "";
  for (const entry of central) {
    if (entry.name.endsWith("/")) continue;
    const start = dataStart.get(entry) ?? 0;
    const raw = bytes.subarray(start, start + entry.compressedSize);
    const data = entry.method === 0 ? raw.slice() : inflateBounded(raw, entry.size);
    if (data.length !== entry.size) reject("ZIP_SIZE_MISMATCH");
    inflated += data.length;
    if (inflated > limits.maxTotalInflated) reject("ZIP_BOMB");
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name)) {
      cells += countCells(data);
      if (cells > limits.maxCells) reject("TOO_MANY_CELLS");
    }
    if (entry.name === "[Content_Types].xml") contentTypes = decoder.decode(data);
    output[entry.name] = data;
  }

  assertWorkbookContentType(contentTypes);
  return { zip: zipSync(output, { level: 0 }), entryCount: central.length, inflatedBytes: inflated, cells };
}

/** Infla con un tope exacto: entrega de a 1 KiB comprimido para que ningún paso pueda crecer sin control. */
function inflateBounded(compressed: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let written = 0;
  const inflate = new Inflate((chunk) => {
    if (written + chunk.length > expected) throw new ImportRejection("ZIP_SIZE_MISMATCH");
    out.set(chunk, written);
    written += chunk.length;
  });
  try {
    const STEP = 1024;
    for (let i = 0; i < compressed.length; i += STEP) inflate.push(compressed.subarray(i, Math.min(compressed.length, i + STEP)), i + STEP >= compressed.length);
    if (compressed.length === 0) inflate.push(new Uint8Array(0), true);
  } catch (error) {
    if (error instanceof ImportRejection) throw error;
    throw new ImportRejection("ZIP_CORRUPT");
  }
  return written === expected ? out : out.subarray(0, written);
}

/** Cuenta `<c ` (celdas) sin decodificar el XML. */
function countCells(data: Uint8Array): number {
  let count = 0;
  for (let i = 0; i + 2 < data.length; i++) {
    if (data[i] === 0x3c && data[i + 1] === 0x63 && data[i + 2] === 0x20) count++; // "<c "
  }
  return count;
}

function assertWorkbookContentType(contentTypes: string): void {
  const override = /<Override\b[^>]*\bPartName="\/xl\/workbook\.xml"[^>]*>/i.exec(contentTypes)?.[0];
  const type = override ? /\bContentType="([^"]*)"/i.exec(override)?.[1] : undefined;
  if (type === WORKBOOK_MAIN) return;
  if (type === WORKBOOK_MACRO) reject("MACRO_ENABLED");
  if (type === WORKBOOK_TEMPLATE || type === WORKBOOK_TEMPLATE_MACRO) reject("TEMPLATE_FILE");
  reject("NOT_XLSX");
}
