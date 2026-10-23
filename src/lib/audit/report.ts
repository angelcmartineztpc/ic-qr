import { STATUS_LABEL, type AuditRow } from "./models";

const HEADER = ["Pieza", "Página", "URL del QR", "Resultado", "Código HTTP", "Respuesta (ms)", "Destino final", "Redirecciones", "Detalle"];

const cell = (v: string | number | undefined): string => {
  const s = v === undefined ? "" : String(v);
  // Neutraliza fórmulas: el CSV se abre en Excel y el contenido viene de un QR.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** CSV UTF-8 con BOM: Excel respeta los acentos al abrirlo con doble clic. */
export function auditCsv(rows: readonly AuditRow[]): string {
  const lines = rows.map((r) => [r.piece, r.page, r.url, STATUS_LABEL[r.status], r.httpStatus, r.responseMs, r.finalUrl, r.redirects, r.detail].map(cell).join(","));
  return `﻿${[HEADER.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
}
