import { ImportResponseSchema } from "@/schemas/import";
import type { FieldKey, ImportIssue, ImportResult } from "@/types";

import { ApiError } from "./api-client";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadOptions {
  /** Mapeo elegido en ColumnMappingDialog: letra de columna → campo. */
  columns?: Record<string, FieldKey | null>;
  sheet?: string;
  /** Importar solo las primeras N filas (acción explícita). */
  truncateTo?: number;
  /** Link del menú para las filas que no lo traen (opcional). */
  defaultMenuUrl?: string;
}

/** El archivo entero fue rechazado: el servidor explica por qué (puede ofrecer «Importar solo las primeras N»). */
export class ImportRejectedError extends Error {
  constructor(readonly issues: ImportIssue[]) {
    super(issues[0]?.message ?? "No se pudo importar el archivo");
    this.name = "ImportRejectedError";
  }
}

const base64url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

/** Validación previa en el navegador, solo por comodidad: el servidor vuelve a comprobarlo todo. */
export function checkFileBeforeUpload(file: Pick<File, "name" | "size">): string | null {
  if (!/\.(xlsx|csv)$/i.test(file.name)) return "Solo se admiten archivos .xlsx y .csv. Si tu archivo es .xls, .xlsm u otro formato, guárdalo como .xlsx o .csv.";
  if (file.size === 0) return "El archivo está vacío.";
  if (file.size > MAX_UPLOAD_BYTES) return `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`;
  return null;
}

export async function uploadExcel(file: File, options: UploadOptions = {}, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<ImportResult> {
  const headers: Record<string, string> = { "Content-Type": file.type === XLSX_MIME ? XLSX_MIME : "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) };
  if (options.columns || options.sheet) headers["X-Column-Mapping"] = base64url(JSON.stringify({ ...(options.sheet ? { sheet: options.sheet } : {}), columns: options.columns ?? {} }));
  if (options.truncateTo) headers["X-Import-Truncate"] = String(options.truncateTo);
  if (options.defaultMenuUrl) headers["X-Default-Menu-Url"] = encodeURIComponent(options.defaultMenuUrl);

  const response = await fetchImpl("/api/import/excel", { method: "POST", headers, body: file, ...(signal ? { signal } : {}) });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, "HTTP_ERROR", `El servidor respondió ${response.status}`);
  }
  const parsed = ImportResponseSchema.safeParse(payload);
  if (parsed.success) {
    if (parsed.data.ok) return parsed.data.result;
    throw new ImportRejectedError(parsed.data.issues);
  }
  const error = payload as { code?: string; message?: string; requestId?: string };
  throw new ApiError(response.status, error.code ?? "HTTP_ERROR", error.message ?? `El servidor respondió ${response.status}`, error.requestId);
}
