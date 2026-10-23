/** Estados de la auditoría y textos para diseñadores (sin tecnicismos). */

export type AuditStatus =
  | "ok"
  | "redirect"
  | "illegible"
  | "no_qr"
  | "invalid_url"
  | "broken"
  | "timeout"
  | "redirect_error"
  | "connection_error";

export const AUDIT_STATUSES: readonly AuditStatus[] = ["ok", "redirect", "illegible", "no_qr", "invalid_url", "broken", "timeout", "redirect_error", "connection_error"];

export type AuditTone = "good" | "bad";

export const STATUS_LABEL: Record<AuditStatus, string> = {
  ok: "Correcto",
  redirect: "Redirige a otro dominio",
  illegible: "QR ilegible",
  no_qr: "Sin QR",
  invalid_url: "Contenido no es URL",
  broken: "URL rota",
  timeout: "Tiempo agotado",
  redirect_error: "Error de redirección",
  connection_error: "Error de conexión",
};

export const STATUS_HELP: Record<AuditStatus, { tone: AuditTone; headline: string; advice: string }> = {
  ok: { tone: "good", headline: "Funciona", advice: "El QR se lee y abre la página correctamente." },
  redirect: { tone: "good", headline: "Funciona", advice: "El QR se lee y abre la página correctamente." },
  illegible: { tone: "bad", headline: "No se puede leer", advice: "El código está dañado o es muy pequeño. Revisa el margen blanco, el contraste y el tamaño." },
  no_qr: { tone: "bad", headline: "No se encontró el QR", advice: "Esta página no tiene ningún QR. Revisa que no se haya perdido en el diseño." },
  invalid_url: { tone: "bad", headline: "No lleva a una página web", advice: "El QR contiene texto que no es un enlace. Vuelve a generarlo con la dirección web." },
  broken: { tone: "bad", headline: "El enlace está roto", advice: "La página no existe o no está disponible. Pide el enlace correcto y regenera el QR." },
  timeout: { tone: "bad", headline: "La página no responde", advice: "Tardó demasiado en abrir. Vuelve a auditar en unos minutos." },
  redirect_error: { tone: "bad", headline: "El enlace da vueltas", advice: "Redirige en círculo. Avisa a quien administra el enlace." },
  connection_error: { tone: "bad", headline: "No se pudo conectar", advice: "La dirección no existe o el sitio está caído. Revisa que esté bien escrita." },
};

export const isSuccess = (s: AuditStatus): boolean => s === "ok" || s === "redirect";
export const isBrokenLink = (s: AuditStatus): boolean => s === "broken" || s === "timeout" || s === "redirect_error" || s === "connection_error";

/** Resultado de comprobar una URL (lo devuelve /api/audit/validate). */
export interface UrlCheck {
  status: AuditStatus;
  httpStatus?: number;
  responseMs?: number;
  finalUrl?: string;
  redirects?: number;
  detail?: string;
}

/** Un QR (o su ausencia) en una página del PDF. */
export interface PageRead {
  page: number;
  piece: string;
  payloads: string[];
  /** QR detectados pero no decodificables. */
  undecoded: number;
  /** Vista de la pieza (data URL) para mostrar junto al resultado; solo en el navegador. */
  thumb?: string;
}

export interface AuditRow extends UrlCheck {
  piece: string;
  page: number;
  url: string;
  thumb?: string;
}

export interface AuditSummary {
  totalPages: number;
  totalQr: number;
  ok: number;
  errors: number;
  brokenLinks: number;
}

export const isHttpUrl = (text: string): boolean => {
  const u = URL.parse(text.trim());
  return !!u && (u.protocol === "http:" || u.protocol === "https:") && u.host !== "";
};

/** Dominio al que lleva el QR; nunca vacío. */
export function destinationOf(row: Pick<AuditRow, "url" | "finalUrl">): string {
  const host = URL.parse(row.finalUrl || row.url)?.hostname;
  return host ? host.replace(/^www\./, "").toLowerCase() : "Sin destino";
}

/** Filas de una página a partir de lo leído y de las comprobaciones de sus URL. */
export function rowsForPage(read: PageRead, checks: ReadonlyMap<string, UrlCheck>): AuditRow[] {
  const base = { piece: read.piece, page: read.page, ...(read.thumb ? { thumb: read.thumb } : {}) };
  const rows: AuditRow[] = read.payloads.map((url) => ({ ...base, url, ...(checks.get(url) ?? { status: "connection_error" as const, detail: "Sin respuesta de la comprobación" }) }));
  for (let i = 0; i < read.undecoded; i++) rows.push({ ...base, url: "", status: "illegible", detail: "QR detectado pero no se pudo decodificar" });
  if (rows.length === 0) rows.push({ ...base, url: "", status: "no_qr", detail: "No se detectó ningún QR en la página" });
  return rows;
}

export function summarize(rows: readonly AuditRow[], totalPages: number): AuditSummary {
  const qr = rows.filter((r) => r.status !== "no_qr");
  return {
    totalPages,
    totalQr: qr.length,
    ok: qr.filter((r) => isSuccess(r.status)).length,
    errors: qr.filter((r) => !isSuccess(r.status)).length,
    brokenLinks: qr.filter((r) => isBrokenLink(r.status)).length,
  };
}
