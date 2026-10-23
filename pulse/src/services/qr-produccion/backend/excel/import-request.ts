import { COLUMN_MAPPING_HEADER_MAX_BYTES, ColumnMappingHeaderSchema } from "@/services/qr-produccion/schemas/import";
import type { FieldKey } from "@/types";

import { HttpError } from "../http/errors";

export interface ImportHeaderOptions {
  columns: Record<string, FieldKey | null> | undefined;
  sheet: string | undefined;
  truncateTo: number | undefined;
  defaultMenuUrl: string | undefined;
}

/** base64url → bytes, sin `Buffer` (corre igual en Deno y en el navegador). */
export function decodeBase64Url(text: string): Uint8Array {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Cabeceras del POST de importación (el cuerpo es el archivo):
 *   X-Column-Mapping: base64url(JSON {sheet?, columns}) · X-Import-Truncate: N · X-Default-Menu-Url: encodeURIComponent(url)
 */
export function parseImportHeaders(headers: Headers, maxRows: number): ImportHeaderOptions {
  let columns: ImportHeaderOptions["columns"];
  let sheet: string | undefined;
  const mappingHeader = headers.get("x-column-mapping");
  if (mappingHeader !== null) {
    if (mappingHeader.length > COLUMN_MAPPING_HEADER_MAX_BYTES) throw new HttpError(400, "VALIDATION_FAILED", "X-Column-Mapping es demasiado grande");
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64Url(mappingHeader)));
    } catch {
      throw new HttpError(400, "VALIDATION_FAILED", "X-Column-Mapping no es base64url de un JSON válido");
    }
    const parsed = ColumnMappingHeaderSchema.safeParse(json);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_FAILED", "Mapeo de columnas no válido", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
    columns = parsed.data.columns;
    sheet = parsed.data.sheet;
  }

  let truncateTo: number | undefined;
  const truncateHeader = headers.get("x-import-truncate");
  if (truncateHeader !== null) {
    const n = Number(truncateHeader);
    if (!Number.isInteger(n) || n < 1 || n > maxRows) throw new HttpError(400, "VALIDATION_FAILED", `X-Import-Truncate debe ser un entero entre 1 y ${maxRows}`);
    truncateTo = n;
  }

  let defaultMenuUrl: string | undefined;
  const defaultHeader = headers.get("x-default-menu-url");
  if (defaultHeader !== null && defaultHeader !== "") {
    try {
      defaultMenuUrl = decodeURIComponent(defaultHeader).slice(0, 2048);
    } catch {
      throw new HttpError(400, "VALIDATION_FAILED", "X-Default-Menu-Url no es válido");
    }
  }
  return { columns, sheet, truncateTo, defaultMenuUrl };
}
