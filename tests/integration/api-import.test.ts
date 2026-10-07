import { createHash } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formatIssueLine } from "@/lib/validation/messages.es";
import type { ImportIssue, ImportResult } from "@/types";

import { buildXlsx, buildZip, CONTENT_TYPES_OK, HEADER, menuRow, minimalWorkbookEntries, SHEET_XML, type Cell } from "../helpers/xlsx-fixtures";

/** La ruta real con sus guardas, el worker real y SheetJS real. Sin mocks. */
const PASSWORD = "una-clave-larga-123";
const AUTH = `Basic ${Buffer.from(`diseno:${PASSWORD}`).toString("base64")}`;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Handler = (request: Request, context: unknown) => Promise<Response>;
let importRoute: Handler;
let health: Handler;

const baseEnv = (): Record<string, string> => ({
  AUTH_MODE: "basic",
  BASIC_AUTH_USER: "diseno",
  BASIC_AUTH_PASSWORD_SHA256: createHash("sha256").update(PASSWORD).digest("hex"),
  APP_ORIGINS: "http://localhost:3000",
  APP_ALLOWED_HOSTS: "localhost:3000",
  STORAGE_PROVIDER: "local",
  STORAGE_LOCAL_DIR: "/tmp/qrpg-import-unused",
  STORAGE_PUBLIC_BASE_URL: "http://localhost:3000/api/storage",
  LOG_LEVEL: "error",
  IMPORT_MAX_ROWS: "50",
  IMPORT_MAX_CELLS: "5000",
  RATE_LIMIT_IMPORT_PER_MIN: "1000",
});

async function load(overrides: Record<string, string> = {}): Promise<void> {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({ ...baseEnv(), ...overrides })) vi.stubEnv(key, value);
  importRoute = (await import("@/app/api/import/excel/route")).POST as Handler;
  health = (await import("@/app/api/health/route")).GET as unknown as Handler;
}

const headers = (extra: Record<string, string> = {}) => ({ host: "localhost:3000", authorization: AUTH, "sec-fetch-site": "same-origin", "content-type": XLSX_MIME, "x-file-name": encodeURIComponent("Mesas – 2026.xlsx"), ...extra });
const upload = (bytes: Uint8Array, extra: Record<string, string> = {}) =>
  importRoute(new Request("http://localhost:3000/api/import/excel", { method: "POST", headers: headers(extra), body: bytes as unknown as BodyInit }), {});

interface Reply {
  ok?: boolean;
  result?: ImportResult;
  issues?: ImportIssue[];
  code?: string;
  message?: string;
}
const reply = async (response: Response) => (await response.json()) as Reply;

beforeAll(() => load());
afterAll(() => vi.unstubAllEnvs());

const mesas = (rows: Cell[][], name = "Mesas") => buildXlsx([{ name, rows: [HEADER, ...rows] }]);

describe("POST /api/import/excel — guardas HTTP", () => {
  it("401, 415, 403 y 421 antes de leer el archivo", async () => {
    const file = mesas([menuRow("Tropical", 1)]);
    expect((await upload(file, { authorization: "" })).status).toBe(401);
    expect((await upload(file, { "content-type": "text/plain" })).status).toBe(415);
    expect((await upload(file, { "content-type": "multipart/form-data; boundary=x" })).status).toBe(415);
    expect((await upload(file, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await upload(file, { host: "evil.example" })).status).toBe(421);
  });

  it("acepta application/octet-stream y 400 con un cuerpo vacío o cabeceras mal formadas", async () => {
    const file = mesas([menuRow("Tropical", 1)]);
    expect((await upload(file, { "content-type": "application/octet-stream" })).status).toBe(200);
    expect((await upload(new Uint8Array(0))).status).toBe(400);
    expect((await upload(file, { "x-import-truncate": "0" })).status).toBe(400);
    expect((await upload(file, { "x-column-mapping": "###" })).status).toBe(400);
    const dup = Buffer.from(JSON.stringify({ columns: { A: "area", B: "area" } })).toString("base64url");
    expect((await upload(file, { "x-column-mapping": dup })).status).toBe(400);
  });

  it("413 si el cuerpo supera el máximo", async () => {
    await load({ IMPORT_MAX_BYTES: "2048" });
    const response = await upload(new Uint8Array(4096));
    expect(response.status).toBe(413);
    await load();
  });
});

describe("POST /api/import/excel — importación", () => {
  it("100 válidas + 5 con error: 100 importables y 5 listadas con su número de fila real", async () => {
    const rows: Cell[][] = [];
    for (let i = 1; i <= 100; i++) rows.push(menuRow("Tropical", i));
    rows.push(menuRow("Bar", "B1", { menu: "" }));
    rows.push(["Bar", "", "", "", "", "https://menu.example.com/x", ""]);
    rows.push(menuRow("Bar", "B3", { menu: "esto no es un link" }));
    rows.push(menuRow("", "B4"));
    rows.push(menuRow("Bar", "B5", { qr: "ftp://x" }));
    await load({ IMPORT_MAX_ROWS: "5000", IMPORT_MAX_CELLS: "300000" });
    const body = await reply(await upload(mesas(rows)));
    expect(body.ok).toBe(true);
    const result = body.result!;
    expect(result.fileName).toBe("Mesas – 2026.xlsx");
    expect(result.stats).toMatchObject({ valid: 100, withErrors: 5, duplicates: 0 });
    expect(result.successful).toHaveLength(100);
    expect(result.rejected.map((r) => r.row)).toEqual([102, 103, 104, 105, 106]);
    const lines = result.errors.map(formatIssueLine);
    expect(lines).toContain("Fila 102: Falta Link del menú");
    expect(lines).toContain("Fila 103: Mesa vacía");
    expect(lines).toContain("Fila 104: Link del menú inválido");
    expect(lines).toContain("Fila 105: Área vacía");
    expect(lines).toContain("Fila 106: Link del QR inválido");
    await load();
  });

  it("detecta cabeceras con otro orden, alias y título encima; guarda las columnas extra", async () => {
    const file = buildXlsx([
      { name: "Instrucciones", rows: [["Llena la hoja Datos"]] },
      {
        name: "Datos",
        rows: [["REPORTE 2026"], [], ["No. Mesa", "Restaurante", "Link del menú (URL)", "Notas"], [12, "Bahía", "https://menu.example.com/bahia", "junto a la barra"]],
      },
    ]);
    const body = await reply(await upload(file));
    expect(body.result?.sheetName).toBe("Datos");
    expect(body.result?.headerRow).toBe(3);
    expect(body.result?.successful[0]).toMatchObject({ row: 4, draft: { area: "Bahía", mesa: "12" }, extra: { Notas: "junto a la barra" } });
  });

  it("un Link del QR ya existente viaja intacto (nunca se regenera)", async () => {
    const body = await reply(await upload(mesas([menuRow("Tropical", 1, { qr: "https://cdn.example.com/qr/1.svg" })])));
    expect(body.result?.successful[0]?.draft.qrUrl).toBe("https://cdn.example.com/qr/1.svg");
  });

  it("columna obligatoria ausente: no se procesan filas y se pide el mapeo; con X-Column-Mapping se importa", async () => {
    const file = buildXlsx([{ name: "Mesas", rows: [["Zona", "Número", "Concepto", "Link del menú"], ["Bar", 5, "Terraza", "https://menu.example.com/bar"]] }]);
    const first = await reply(await upload(file));
    expect(first.result?.missingColumns).toEqual(["mesa"]);
    expect(first.result?.successful).toEqual([]);

    const mapping = Buffer.from(JSON.stringify({ columns: { B: "mesa" } })).toString("base64url");
    const second = await reply(await upload(file, { "x-column-mapping": mapping }));
    expect(second.result?.successful[0]?.draft).toMatchObject({ area: "Bar", mesa: "5" });
    expect(second.result?.mapping.find((m) => m.column === "B")).toMatchObject({ field: "mesa", match: "manual" });
  });

  it("más filas que el máximo: 422 con TOO_MANY_ROWS; con X-Import-Truncate se importan las primeras N", async () => {
    const rows: Cell[][] = Array.from({ length: 60 }, (_, i) => menuRow("Tropical", i + 1));
    const file = mesas(rows);
    const rejected = await upload(file);
    expect(rejected.status).toBe(422);
    expect((await reply(rejected)).issues?.[0]?.code).toBe("TOO_MANY_ROWS");
    const truncated = await reply(await upload(file, { "x-import-truncate": "50" }));
    expect(truncated.result?.stats).toMatchObject({ valid: 50, truncatedTo: 50 });
    expect(truncated.result?.warnings.some((w) => w.code === "ROWS_TRUNCATED_BY_USER")).toBe(true);
  });

  it("fechas, números y celdas combinadas", async () => {
    const file = buildXlsx([
      {
        name: "Mesas",
        rows: [HEADER, ["Tropical", "", new Date(Date.UTC(2026, 0, 5)), "", "", "https://menu.example.com/a", ""], [null, "", 2.5, "", "", "https://menu.example.com/b", ""], [null, "", 3, "", "", "https://menu.example.com/c", ""]],
        merges: ["A2:A4"],
      },
    ]);
    const result = (await reply(await upload(file))).result!;
    expect(result.successful.map((r) => r.draft.mesa)).toEqual(["2026-01-05", "2.5", "3"]);
    expect(result.successful.every((r) => r.draft.area === "Tropical")).toBe(true);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(["DATE_CELL", "MERGED_CELLS_FILLED"]));
  });

  it("acepta libros con descriptor de datos (Google Sheets)", async () => {
    const zip = buildZip(minimalWorkbookEntries(SHEET_XML([["Área", "Mesa", "Link del menú"], ["Bar", "M1", "https://menu.example.com/bar"]])).map((e) => ({ ...e, descriptor: true })));
    const body = await reply(await upload(zip));
    expect(body.result?.stats.valid).toBe(1);
  });
});

describe("POST /api/import/excel — archivos hostiles", () => {
  const hostile: Array<[string, () => Uint8Array, string]> = [
    ["CSV renombrado", () => new TextEncoder().encode("Área,Mesa\nBar,1\n".repeat(30)), "NOT_A_ZIP"],
    ["xls antiguo (OLE)", () => Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, ...new Array(600).fill(0)]), "LEGACY_XLS_OR_ENCRYPTED"],
    ["macros", () => buildZip([...minimalWorkbookEntries(SHEET_XML([["a"]])).map((e, i) => (i === 0 ? { ...e, data: new TextEncoder().encode(CONTENT_TYPES_OK.replace("sheet.main+xml", "sheet.macroEnabled.main+xml").replace("openxmlformats-officedocument.spreadsheetml", "ms-excel")) } : e))]), "MACRO_ENABLED"],
    ["bomba de descompresión", () => buildZip([...minimalWorkbookEntries(SHEET_XML([["a"]])).slice(0, 3), { name: "xl/worksheets/sheet1.xml", data: new Uint8Array(15 * 1024 * 1024) }]), "ZIP_BOMB"],
    ["demasiadas celdas", () => buildZip(minimalWorkbookEntries(SHEET_XML(Array.from({ length: 2000 }, () => ["a", "b", "c", "d"])))), "TOO_MANY_CELLS"],
    ["datos tras el EOCD", () => new Uint8Array([...mesas([menuRow("Tropical", 1)]), 1, 2, 3, 4]), "ZIP_CORRUPT"],
  ];

  it.each(hostile)("%s → rechazo 422 con %s y el servidor sigue respondiendo", async (_name, make, code) => {
    const response = await upload(make());
    expect(response.status).toBe(422);
    const body = await reply(response);
    expect(body.ok).toBe(false);
    expect(body.issues?.[0]).toMatchObject({ code, severity: "error", field: "file" });
    expect((await health(new Request("http://localhost:3000/api/health", { headers: { host: "localhost:3000" } }), {})).status).toBeLessThan(500);
  });

  it("sin hoja con cabeceras reconocibles", async () => {
    const body = await reply(await upload(buildXlsx([{ name: "Hoja1", rows: [["a", "b", "c"], [1, 2, 3]] }])));
    expect(body.issues?.[0]?.code).toBe("NO_SHEET_WITH_HEADERS");
  });
});

describe("importExcel — límites del worker", () => {
  it("si la lectura tarda más que el límite, se mata el worker y se rechaza con PARSE_TIMEOUT", async () => {
    const { importExcel } = await import("@/server/excel/import-excel");
    const { DEFAULT_GUARD_LIMITS } = await import("@/server/excel/upload-guard");
    const response = await importExcel(mesas([menuRow("Tropical", 1)]), { fileName: "a.xlsx", maxRows: 5000, limits: DEFAULT_GUARD_LIMITS, timeoutMs: 1 });
    expect(response).toMatchObject({ ok: false, issues: [{ code: "PARSE_TIMEOUT" }] });
    // Y el servidor sigue atendiendo importaciones normales.
    expect((await reply(await upload(mesas([menuRow("Tropical", 1)])))).ok).toBe(true);
  });
});
