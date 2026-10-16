/**
 * qr-importar-excel — POST con el .xlsx o .csv como cuerpo binario (no multipart: así no hay `formData()` sin límite).
 * El archivo nunca se guarda: se lee en memoria. Cabeceras:
 *   X-File-Name: encodeURIComponent(nombre) · X-Column-Mapping: base64url(JSON) · X-Import-Truncate: N · X-Default-Menu-Url
 */
import { fileIssueStatus } from "@/services/qr-produccion/excel/file-issues.ts";
import { decodeFileName, importExcel } from "@/services/qr-produccion/backend/excel/import-excel.ts";
import { parseImportHeaders } from "@/services/qr-produccion/backend/excel/import-request.ts";
import { HttpError } from "@/services/qr-produccion/backend/http/errors.ts";
import { qrHostMatcher } from "@/services/qr-produccion/backend/qr/host-policy.ts";

import { getConfig } from "../_shared/config.ts";
import { guarded, limits } from "../_shared/guards.ts";
import { qrHostPolicy } from "../_shared/services.ts";
import { openWorkbook } from "../_shared/xlsx-reader.ts";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const { env } = getConfig();

Deno.serve(
  guarded(
    async (ctx) => {
      const headers = ctx.request.headers;
      const options = parseImportHeaders(headers, env.IMPORT_MAX_ROWS);
      const bytes = await ctx.readBody();
      if (bytes.length === 0) throw new HttpError(400, "BAD_REQUEST", "El archivo está vacío");

      const response = await importExcel(bytes, {
        fileName: decodeFileName(headers.get("x-file-name")),
        ...options,
        maxRows: env.IMPORT_MAX_ROWS,
        limits: { maxEntries: 2000, maxEntryInflated: env.IMPORT_MAX_ENTRY_INFLATED, maxTotalInflated: env.IMPORT_MAX_TOTAL_INFLATED, maxCells: env.IMPORT_MAX_CELLS, maxRatio: 200 },
        isQrHostAllowed: qrHostMatcher(qrHostPolicy()),
        openWorkbook,
      });
      if (response.ok) return Response.json(response, { headers: { "Cache-Control": "no-store" } });
      return Response.json(response, { status: fileIssueStatus(response.issues[0]?.code ?? "NOT_XLSX"), headers: { "Cache-Control": "no-store" } });
    },
    {
      methods: ["POST"],
      contentTypes: [XLSX_MIME, "application/octet-stream", "text/csv", "application/vnd.ms-excel"],
      rateLimit: limits().import,
      semaphore: limits().importSlots,
      maxBody: env.IMPORT_MAX_BYTES,
    },
  ),
);
