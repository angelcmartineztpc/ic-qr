import type { RecordsExcelRequest } from "@/services/qr-produccion/schemas/links";
import type { QRRecord } from "@/types";

import { authedFetch, errorFromResponse, functionUrl } from "./api-client";

export type ExcelFetcher = (records: readonly QRRecord[], signal?: AbortSignal) => Promise<Blob>;

/** Lo que lleva el Excel de cada pieza. Un QR generado por la herramienta no se escribe: solo el que la persona aportó. */
export function excelRowOf(record: QRRecord): RecordsExcelRequest["records"][number] {
  const own = record.qr.source !== "generated" ? record.qrUrl : undefined;
  return { area: record.area, estacion: record.estacion, mesa: record.mesa, subgrupo: record.subgrupo, concepto: record.concepto, menuUrl: record.menuUrl, ...(own === undefined ? {} : { qrUrl: own }) };
}

/** Pide al servidor el Excel actualizado (`POST qr-enlaces/records-excel`). */
export const fetchRecordsExcel: ExcelFetcher = async (records, signal) => {
  const response = await authedFetch(functionUrl("qr-enlaces", "/records-excel"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records: records.map(excelRowOf) }), ...(signal ? { signal } : {}) });
  if (!response.ok) throw await errorFromResponse(response);
  return response.blob();
};
