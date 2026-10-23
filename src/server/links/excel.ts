import * as XLSX from "xlsx";

import { shortCodeOf } from "@/lib/links/own-links";
import { FIELD_LABELS } from "@/lib/validation/messages.es";
import type { RecordsExcelRequest } from "@/schemas/links";

import type { LinkDeps } from "./service";

export const ORIGINAL_LINK_HEADER = "Link original (referencia)";
export const EXCEL_SHEET_NAME = "Piezas";

/**
 * Excel actualizado: los mismos encabezados que reconoce la importación, con el link corto en «Link del menú»
 * y una columna de referencia con el destino vigente de cada link corto (la herramienta no la lee al importar).
 * «Link del QR» solo trae los QR que la persona aportó: un QR generado no se convierte en «existente».
 */
export async function buildUpdatedWorkbook(records: RecordsExcelRequest["records"], deps: Pick<LinkDeps, "repo" | "ownHosts">): Promise<Uint8Array> {
  const codes = [...new Set(records.flatMap((r) => (isOwn(r.menuUrl, deps.ownHosts) ? [shortCodeOf(r.menuUrl) as string] : [])))];
  const destinations = new Map<string, string>();
  await Promise.all(
    codes.map(async (code) => {
      const link = await deps.repo.get(code);
      if (link) destinations.set(code, link.destination);
    }),
  );

  const header = [FIELD_LABELS.area, FIELD_LABELS.estacion, FIELD_LABELS.mesa, FIELD_LABELS.subgrupo, FIELD_LABELS.concepto, FIELD_LABELS.menuUrl, FIELD_LABELS.qrUrl, ORIGINAL_LINK_HEADER];
  const rows = records.map((r) => {
    const code = isOwn(r.menuUrl, deps.ownHosts) ? shortCodeOf(r.menuUrl) : null;
    return [r.area, r.estacion, r.mesa, r.subgrupo, r.concepto, r.menuUrl, r.qrUrl ?? "", code ? (destinations.get(code) ?? "") : ""];
  });
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows]);
  sheet["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 38 }, { wch: 38 }, { wch: 60 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, EXCEL_SHEET_NAME);
  return new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

const isOwn = (url: string, ownHosts: readonly string[]): boolean => {
  const host = URL.parse(url)?.host;
  return host !== undefined && ownHosts.includes(host) && shortCodeOf(url) !== null;
};
