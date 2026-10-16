import type { RecordsExcelRequest } from "@/schemas/links";
import type { QRRecord } from "@/types";

import { ApiError } from "./api-client";

export type ExcelFetcher = (records: readonly QRRecord[], signal?: AbortSignal) => Promise<Blob>;

/** Lo que lleva el Excel de cada pieza. Un QR generado por la herramienta no se escribe: solo el que la persona aportó. */
export function excelRowOf(record: QRRecord): RecordsExcelRequest["records"][number] {
  const own = record.qr.source !== "generated" ? record.qrUrl : undefined;
  return { area: record.area, estacion: record.estacion, mesa: record.mesa, subgrupo: record.subgrupo, concepto: record.concepto, menuUrl: record.menuUrl, ...(own === undefined ? {} : { qrUrl: own }) };
}

/** Pide al servidor el Excel actualizado (`POST /api/records/excel`). */
export const fetchRecordsExcel: ExcelFetcher = async (records, signal) => {
  const response = await fetch("/api/records/excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: records.map(excelRowOf) }), ...(signal ? { signal } : {}) });
  if (!response.ok) {
    let payload: { code?: string; message?: string; requestId?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(response.status, payload.code ?? "HTTP_ERROR", payload.message ?? `El servidor respondió ${response.status}`, payload.requestId);
  }
  return response.blob();
};
