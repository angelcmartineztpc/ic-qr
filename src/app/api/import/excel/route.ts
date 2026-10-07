import { fileIssueStatus } from "@/lib/excel/file-issues";
import { COLUMN_MAPPING_HEADER_MAX_BYTES, ColumnMappingHeaderSchema } from "@/schemas/import";
import { getEnv } from "@/server/env";
import { decodeFileName, importExcel } from "@/server/excel/import-excel";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { hostPolicyFromEnv } from "@/server/qr/services";
import type { FieldKey } from "@/types";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * POST /api/import/excel — cuerpo binario .xlsx (no multipart: así no hay
 * `formData()` sin límite). El archivo nunca se guarda: se lee en memoria.
 *  X-File-Name: encodeURIComponent(nombre) · X-Column-Mapping: base64url(JSON) · X-Import-Truncate: N
 */
export const POST = withApiGuards(
  async (ctx) => {
    const env = getEnv();
    const headers = ctx.request.headers;

    let columns: Record<string, FieldKey | null> | undefined;
    let sheet: string | undefined;
    const mappingHeader = headers.get("x-column-mapping");
    if (mappingHeader !== null) {
      if (mappingHeader.length > COLUMN_MAPPING_HEADER_MAX_BYTES) throw new HttpError(400, "VALIDATION_FAILED", "X-Column-Mapping es demasiado grande");
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(Buffer.from(mappingHeader, "base64url").toString("utf8"));
      } catch {
        throw new HttpError(400, "VALIDATION_FAILED", "X-Column-Mapping no es base64url de un JSON válido");
      }
      const parsed = ColumnMappingHeaderSchema.safeParse(parsedJson);
      if (!parsed.success) throw new HttpError(400, "VALIDATION_FAILED", "Mapeo de columnas no válido", parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })));
      columns = parsed.data.columns;
      sheet = parsed.data.sheet;
    }

    let truncateTo: number | undefined;
    const truncateHeader = headers.get("x-import-truncate");
    if (truncateHeader !== null) {
      const n = Number(truncateHeader);
      if (!Number.isInteger(n) || n < 1 || n > env.IMPORT_MAX_ROWS) throw new HttpError(400, "VALIDATION_FAILED", `X-Import-Truncate debe ser un entero entre 1 y ${env.IMPORT_MAX_ROWS}`);
      truncateTo = n;
    }

    const policy = hostPolicyFromEnv(env);
    const allowed = policy.mode === "allowlist" ? policy.hosts : null;
    const bytes = await ctx.readBody();
    if (bytes.length === 0) throw new HttpError(400, "BAD_REQUEST", "El archivo está vacío");

    const response = await importExcel(bytes, {
      fileName: decodeFileName(headers.get("x-file-name")),
      columns,
      sheet,
      truncateTo,
      maxRows: env.IMPORT_MAX_ROWS,
      limits: { maxEntries: 2000, maxEntryInflated: env.IMPORT_MAX_ENTRY_INFLATED, maxTotalInflated: env.IMPORT_MAX_TOTAL_INFLATED, maxCells: env.IMPORT_MAX_CELLS, maxRatio: 200 },
      isQrHostAllowed: allowed ? (host) => allowed.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h)) : undefined,
    });
    if (response.ok) return Response.json(response);
    return Response.json(response, { status: fileIssueStatus(response.issues[0]?.code ?? "NOT_XLSX") });
  },
  () => ({
    contentTypes: [XLSX_MIME, "application/octet-stream"],
    rateLimit: getLimits().import,
    semaphore: getLimits().importSlots,
    maxBody: getEnv().IMPORT_MAX_BYTES,
    rejectWhenDraining: true,
  }),
);
