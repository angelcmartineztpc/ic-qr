import { shortCodeOf } from "@/services/qr-produccion/links/own-links";
import type { RecordsExcelRequest } from "@/services/qr-produccion/schemas/links";
import { FIELD_LABELS } from "@/services/qr-produccion/validation/messages.es";

import type { LinkDeps } from "./service";
import { ownBasePath } from "@/services/qr-produccion/links/own-links";

export const ORIGINAL_LINK_HEADER = "Link original (referencia)";
export const EXCEL_SHEET_NAME = "Piezas";
export const EXCEL_COLUMN_WIDTHS = [22, 22, 12, 16, 22, 38, 38, 60] as const;

const isOwn = (url: string, deps: Pick<LinkDeps, "ownHosts" | "base">): boolean => {
  const host = URL.parse(url)?.host;
  return host !== undefined && deps.ownHosts.includes(host) && shortCodeOf(url, ownBasePath(deps.base)) !== null;
};

/**
 * Filas del Excel actualizado: los mismos encabezados que reconoce la importación, con el link corto en «Link del menú»
 * y una columna de referencia con el destino vigente de cada link corto (la herramienta no la lee al importar).
 * «Link del QR» solo trae los QR que la persona aportó: un QR generado no se convierte en «existente».
 * El libro .xlsx se escribe en la función con SheetJS (`aoa_to_sheet([header, ...rows])`).
 */
export async function buildUpdatedRows(records: RecordsExcelRequest["records"], deps: Pick<LinkDeps, "repo" | "ownHosts" | "base">): Promise<{ header: string[]; rows: string[][] }> {
  const basePath = ownBasePath(deps.base);
  const codes = [...new Set(records.flatMap((r) => (isOwn(r.menuUrl, deps) ? [shortCodeOf(r.menuUrl, basePath) as string] : [])))];
  const destinations = new Map<string, string>();
  await Promise.all(
    codes.map(async (code) => {
      const link = await deps.repo.get(code);
      if (link) destinations.set(code, link.destination);
    }),
  );
  const header = [FIELD_LABELS.area, FIELD_LABELS.estacion, FIELD_LABELS.mesa, FIELD_LABELS.subgrupo, FIELD_LABELS.concepto, FIELD_LABELS.menuUrl, FIELD_LABELS.qrUrl, ORIGINAL_LINK_HEADER];
  const rows = records.map((r) => {
    const code = isOwn(r.menuUrl, deps) ? shortCodeOf(r.menuUrl, basePath) : null;
    return [r.area, r.estacion, r.mesa, r.subgrupo, r.concepto, r.menuUrl, r.qrUrl ?? "", code ? (destinations.get(code) ?? "") : ""];
  });
  return { header, rows };
}
