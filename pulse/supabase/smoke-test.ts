/**
 * Prueba de humo SIN Deno ni Supabase: `bun supabase/smoke-test.ts`.
 * Carga los `index.ts` reales de las Edge Functions con un `Deno` mínimo y un Supabase simulado
 * (Auth, PostgREST y Storage con el mismo contrato HTTP que usa supabase-js), y recorre los flujos
 * principales. Comprueba el cableado (rutas, guardas, adaptadores, forma de las consultas); NO sustituye
 * a probar contra un proyecto real: el PDF (pdfkit), el .xlsx (SheetJS) y las fuentes no se ejercitan aquí.
 */
import { existsSync, readFileSync } from "node:fs";

import { readFrames, type Frame } from "../src/services/qr-produccion/export/frames";
import { getTemplate } from "../src/services/qr-produccion/templates";
import { encodeMatrix } from "../src/services/qr-produccion/qr/encode";
import { renderQrSvg } from "../src/services/qr-produccion/qr/render-svg";

const URL_BASE = "http://supabase.test";
const handlers = new Map<string, (request: Request) => Promise<Response> | Response>();
let current = "";
(globalThis as unknown as { Deno: unknown }).Deno = {
  serve: (handler: (request: Request) => Promise<Response> | Response) => void handlers.set(current, handler),
  env: { toObject: () => ({ SUPABASE_URL: URL_BASE, SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service", QR_PUBLIC_BASE: "", EXPORT_MAX_RECORDS: "250" }) },
};

// ---------- Supabase simulado ----------
const objects = new Map<string, Uint8Array>();
const tables: Record<string, Array<Record<string, unknown>>> = { qr_activos: [], qr_enlaces: [], qr_destinos_resort: [{ resort_codigo: "PRPL", servicio: "pool", destino: "https://pool-service.palaceresorts.com/pool-area/PRPL" }] };

/** Archivos del bucket de QR (las fuentes viven en otro). */
const qrObjects = () => [...objects.keys()].filter((key) => key.startsWith("qr-produccion/qr/v1/")).length;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const storageError = (statusCode: string, error: string, message: string) => json({ statusCode, error, message }, 400);

function rows(table: string, search: URLSearchParams): Array<Record<string, unknown>> {
  return (tables[table] ?? []).filter((row) => [...search.entries()].every(([key, value]) => !value.startsWith("eq.") || String(row[key]) === value.slice(3)));
}

async function fakeSupabase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  // «ccc» es una sesión con rol; «ddd», una sesión sin el rol Admin / «QR Producción».
  if (url.pathname === "/auth/v1/user") return /^Bearer aaa\.bbb\.(ccc|ddd)$/.test(request.headers.get("authorization") ?? "") ? json({ id: "user-1", email: "a@b.c", aud: "authenticated" }) : json({ message: "invalid JWT" }, 401);
  if (url.pathname === "/rest/v1/rpc/qr_tiene_acceso") return json(request.headers.get("authorization") === "Bearer aaa.bbb.ccc");

  const storage = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (storage) {
    const path = `${storage[1]}/${decodeURIComponent(storage[2] as string)}`;
    if (request.method === "POST") {
      if (request.headers.get("x-upsert") !== "true" && objects.has(path)) return storageError("409", "Duplicate", "The resource already exists");
      objects.set(path, new Uint8Array(await request.arrayBuffer()));
      return json({ Key: path });
    }
    const body = objects.get(path);
    return body ? new Response(body as unknown as BodyInit, { headers: { "content-type": "image/svg+xml" } }) : storageError("404", "not_found", "Object not found");
  }

  const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
  if (rest) {
    const table = rest[1] as string;
    const single = (request.headers.get("accept") ?? "").includes("vnd.pgrst.object");
    if (request.method === "GET" || request.method === "HEAD") {
      const found = rows(table, url.searchParams);
      if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "content-range": `0-0/${found.length}` } });
      if (single) return found.length === 1 ? json(found[0]) : json({ code: "PGRST116", message: "no rows" }, 406);
      return json(found);
    }
    if (request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const conflictKey = table === "qr_activos" ? "content_hash" : "codigo";
      const duplicate = (tables[table] ?? []).some((row) => row[conflictKey] === body[conflictKey] || (table === "qr_enlaces" && row["url_original"] === body["url_original"]));
      if (duplicate) return (request.headers.get("prefer") ?? "").includes("ignore-duplicates") ? new Response(null, { status: 201 }) : json({ code: "23505", message: "duplicate key" }, 409);
      (tables[table] ??= []).push(body);
      return new Response(null, { status: 201 });
    }
    if (request.method === "PATCH") {
      const found = rows(table, url.searchParams);
      Object.assign(found[0] ?? {}, await request.json());
      return found.length ? json(found[0]) : json({ code: "PGRST116", message: "no rows" }, 406);
    }
  }
  return json({ message: `no simulado: ${request.method} ${url.pathname}` }, 500);
}
globalThis.fetch = fakeSupabase as typeof fetch;

// ---------- recorrido ----------
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.warn(`${ok ? "ok    " : "FALLA "} ${name}${ok ? "" : ` → ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};
const call = async (fn: string, path: string, init: RequestInit & { token?: boolean } = {}) => {
  const { token = true, headers, ...rest } = init;
  const handler = handlers.get(fn);
  if (!handler) throw new Error(`la función ${fn} no registró Deno.serve`);
  return handler(new Request(`${URL_BASE}/functions/v1/${fn}${path}`, { ...rest, headers: { ...(token ? { authorization: "Bearer aaa.bbb.ccc" } : {}), ...headers } }));
};
const post = (fn: string, path: string, body: unknown, extra: Record<string, string> = {}) => call(fn, path, { method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body) });

// La tipografía comercial NO se versiona: si está en el repositorio de origen (solo lectura) se carga al bucket simulado.
const FONT = new URL("../../assets/fonts/address-sans/AddressSansPro-CdSemibold.woff2", import.meta.url).pathname;
const hasFont = existsSync(FONT);
if (hasFont) objects.set("qr-fuentes/address-sans/AddressSansPro-CdSemibold.woff2", new Uint8Array(readFileSync(FONT)));

for (const fn of ["qr-resolver", "qr-enlaces", "qr-estable", "qr-logo", "qr-exportar", "qr-vista-previa", "qr-importar-excel"]) {
  current = fn;
  await import(`./functions/${fn}/index.ts`);
}

const MENU = "https://menu.example.com/tropical";
const item = { recordId: "r1", menuUrl: MENU, expectedRevision: 0 };

// Autenticación y CORS
check("sin JWT → 401", (await call("qr-resolver", "", { method: "POST", token: false, headers: { "content-type": "application/json" }, body: "{}" })).status === 401);
check("JWT que Auth no reconoce → 401", (await post("qr-resolver", "", { items: [item] }, { authorization: "Bearer xxx.yyy.zzz" })).status === 401);
check("preflight → 204 con CORS", (await call("qr-resolver", "", { method: "OPTIONS", token: false })).status === 204);
check("con sesión pero sin el rol → 403", (await post("qr-resolver", "", { items: [item] }, { authorization: "Bearer aaa.bbb.ddd" })).status === 403);

// qr-resolver: generar, reutilizar y regla crítica
const first = await post("qr-resolver", "", { items: [item] });
const firstBody = (await first.json()) as { created: number; results: Array<{ outcome: string; qrUrl: string }> };
check("generar crea un QR y lo sube al bucket", first.status === 200 && firstBody.created === 1 && [...objects.keys()].some((k) => k.startsWith("qr-produccion/qr/v1/")), firstBody);
check("el catálogo qr_activos registra el QR (content_hash → storage_key)", tables["qr_activos"]?.length === 1 && String(tables["qr_activos"]?.[0]?.["storage_key"]).startsWith("qr/v1/"), tables["qr_activos"]);
const again = (await (await post("qr-resolver", "", { items: [item] })).json()) as { created: number; reused: number };
check("la segunda vez lo reutiliza sin crear otro", again.created === 0 && again.reused === 1 && qrObjects() === 1, again);
const forced = (await (await post("qr-resolver", "", { items: [{ ...item, recordId: "r2", qrUrl: "https://x.example.com/a.svg" }] })).json()) as { failed: number };
check("REGLA CRÍTICA: un ítem con Link del QR no genera", forced.failed === 1 && qrObjects() === 1, forced);

// QR público
const qrUrl = new URL(firstBody.results[0]?.qrUrl ?? "http://x");
const publicQr = await call("qr-resolver", qrUrl.pathname.replace("/functions/v1/qr-resolver", ""), { token: false });
check("GET público del SVG (sin sesión, inmutable, con CSP)", publicQr.status === 200 && (await publicQr.text()) === renderQrSvg(encodeMatrix(MENU)) && publicQr.headers.get("content-security-policy")?.includes("sandbox") === true && publicQr.headers.get("cache-control")?.includes("immutable") === true);
check("clave inventada → 404", (await call("qr-resolver", "/storage/qr/v1/zz.svg", { token: false })).status === 404);

// Verificar un QR propio ya subido (se lee del storage, sin red)
const verified = (await (await post("qr-resolver", "", { verify: [{ recordId: "r3", qrUrl: firstBody.results[0]?.qrUrl, menuUrl: MENU }] })).json()) as { results: Array<{ outcome: string }> };
check("verificar un QR propio lo decodifica y guarda la instantánea", verified.results[0]?.outcome === "existing-ok" && [...objects.keys()].some((k) => k.startsWith("qr-produccion/qr/ext/v1/")), verified);

// qr-enlaces
const shortened = (await (await post("qr-enlaces", "/shorten", { urls: [MENU, MENU, "no es un link"] })).json()) as { results: Array<{ status: string; shortUrl?: string; code?: string }> };
const [a, b, c] = shortened.results;
check("acortar: crea (la fila repetida comparte código) y marca el inválido", a?.status === "created" && c?.status === "invalid" && a.code === b?.code && tables["qr_enlaces"]?.length === 1, shortened);
check("acortar otra vez lo reutiliza (idempotente)", ((await (await post("qr-enlaces", "/shorten", { urls: [MENU] })).json()) as { results: Array<{ status: string }> }).results[0]?.status === "reused");
check("el link corto usa la ruta de la función (/functions/v1/qr-enlaces/s/…)", a?.shortUrl === `${URL_BASE}/functions/v1/qr-enlaces/s/${a?.code}`, a);
const redirect = await call("qr-enlaces", `/s/${a?.code}`, { token: false, redirect: "manual" });
check("GET /s/{código} público → 302 al destino", redirect.status === 302 && redirect.headers.get("location") === MENU, redirect.status);
const changed = await call("qr-enlaces", `/links/${a?.code}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": '"1"' }, body: JSON.stringify({ destination: "https://nuevo.example.com/menu" }) });
check("PATCH cambia el destino (revisión 2, historial)", changed.status === 200 && ((await changed.json()) as { revision: number }).revision === 2);
const stale = await call("qr-enlaces", `/links/${a?.code}`, { method: "PATCH", headers: { "content-type": "application/json", "if-match": '"1"' }, body: JSON.stringify({ destination: "https://otro.example.com/" }) });
check("PATCH con revisión vieja → 409", stale.status === 409, stale.status);
const stable = await call("qr-enlaces", "/api/qr/PRPL/pool", { token: false, redirect: "manual" });
check("GET /api/qr/{resort}/{servicio} → 302 al destino de la tabla", stable.status === 302 && stable.headers.get("location")?.endsWith("/pool-area/PRPL") === true, stable.status);

// qr-estable y qr-logo
current = "qr-estable";
check("qr-estable: resort desconocido → 404", (await call("qr-estable", "/ZZZZ/pool", { token: false })).status === 404);
check("qr-estable: resort conocido → 302", (await call("qr-estable", "/PRPL/pool", { token: false, redirect: "manual" })).status === 302);
const logo = await call("qr-logo", "", { method: "POST", headers: { "content-type": "image/svg+xml" }, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z" fill="#000"/></svg>' });
check("qr-logo: sanea el SVG", logo.status === 200 && ((await logo.json()) as { geometry?: unknown }).geometry !== undefined);

// qr-exportar y qr-vista-previa con pdfkit, fontkit y la tipografía reales (si están disponibles en esta máquina)
if (!hasFont) console.warn("OMITE exportar y vista previa: falta la tipografía de las piezas (assets/fonts/address-sans)");
else {
  const template = getTemplate("tropical-table");
  if (!template) throw new Error("falta tropical-table");
  const qr = (firstBody.results[0] as unknown as { qr: unknown }).qr;
  const record = { id: "r1", area: "Tropical", estacion: "Bar", mesa: "M1", subgrupo: "", concepto: "", menuUrl: MENU, qrUrl: firstBody.results[0]?.qrUrl, qr };
  const pdf = { mode: "sheet", pageSize: { kind: "A4" }, orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 }, gapMm: 2, bleedMm: 0, cutLine: "none", includeQrBackground: true, colorSpace: "rgb", textMode: "live", center: true };
  const exportBody = (overrides: Record<string, unknown> = {}) => ({ records: [record], templateId: "tropical-table", templateOverrides: {}, layout: { templateId: "tropical-table", base: template.defaultLayout, overrides: {} }, options: { fileName: "prueba", formats: ["pdf", "svgZip"], pdf, ...overrides } });

  const exported = await post("qr-exportar", "", exportBody());
  const frames: Frame[] = [];
  if (exported.status !== 200) console.error(await exported.clone().text());
  if (exported.status === 200 && exported.body) for await (const frame of readFrames(exported.body)) frames.push(frame);
  const files = frames.flatMap((f) => (f.type === 2 ? [f.payload.fileId] : []));
  const pdfBytes = frames.flatMap((f) => (f.type === 3 && f.fileId === "pdf" ? [f.data] : []));
  const head = new TextDecoder().decode(pdfBytes[0]?.subarray(0, 5));
  check("qr-exportar: stream con progreso, PDF vectorial (pdfkit + fuente real en modo texto vivo) y ZIP de SVG", exported.status === 200 && frames.at(-1)?.type === 4 && files.includes("pdf") && files.includes("zip") && head === "%PDF-", { status: exported.status, files, last: frames.at(-1) });
  const pdfText = new TextDecoder("latin1").decode(Uint8Array.from(pdfBytes.flatMap((chunk) => [...chunk])));
  check("el PDF no contiene imágenes (todo es vectorial)", !/\/Subtype\s*\/Image/.test(pdfText));
  // Medida informativa (no es una aserción): tiempo de pared de una llamada con N piezas, en Bun, no en Deno.
  for (const [label, options] of [["PDF texto vivo", { formats: ["pdf"], pdf }], ["PDF en contornos + ZIP de SVG", { formats: ["pdf", "svgZip"], pdf: { ...pdf, textMode: "outlined" }, svg: { textMode: "outlined", cutLine: false } }]] as const) {
    const many = { ...exportBody(options), records: Array.from({ length: 200 }, (_, i) => ({ ...record, id: `m${i}`, mesa: `M${i}` })) };
    const started = performance.now();
    const response = await post("qr-exportar", "", many);
    let bytes = 0;
    if (response.body) for await (const frame of readFrames(response.body)) if (frame.type === 3) bytes += frame.data.length;
    console.warn(`medida ${label}: 200 piezas en ${Math.round(performance.now() - started)} ms (${Math.round(bytes / 1024)} KB)`);
  }
  check("qr-exportar: más piezas que el máximo por llamada → 400 con el motivo", (await post("qr-exportar", "", { ...exportBody(), records: Array.from({ length: 251 }, (_, i) => ({ ...record, id: `r${i}` })) })).status === 400);
  check("qr-exportar: un QR que no es el de su archivo → 400 QR_IDENTITY_MISMATCH", ((await (await post("qr-exportar", "", { ...exportBody(), records: [{ ...record, qr: { ...(qr as object), contentHash: "b".repeat(64) } }] })).json()) as { code?: string }).code === "QR_IDENTITY_MISMATCH");

  const tile = { key: "k1", recordId: "r1", area: "Tropical", estacion: "", mesa: "M1", subgrupo: "", concepto: "", menuUrl: MENU, qr: { source: "none" } };
  const preview = await post("qr-vista-previa", "", { templateId: "tropical-table", templateOverrides: {}, layout: { templateId: "tropical-table", base: template.defaultLayout, overrides: {} }, detail: "full", tiles: [tile] });
  const previewBody = (await preview.json()) as { tiles?: Record<string, { svg: string }> };
  for (const detail of ["full", "low"]) {
    const started = performance.now();
    await post("qr-vista-previa", "", { templateId: "tropical-table", templateOverrides: {}, layout: { templateId: "tropical-table", base: template.defaultLayout, overrides: {} }, detail, tiles: Array.from({ length: 48 }, (_, i) => ({ ...tile, key: `k${i}`, recordId: `r${i}`, mesa: `M${i}` })) });
    console.warn(`medida vista previa (${detail}): 48 piezas en ${Math.round(performance.now() - started)} ms`);
  }
  check("qr-vista-previa: SVG de 70 mm en contornos con la fuente real", preview.status === 200 && /width="70mm"/.test(previewBody.tiles?.["k1"]?.svg ?? "") && !/<text/.test(previewBody.tiles?.["k1"]?.svg ?? ""), preview.status);
}

// qr-importar-excel con un .xlsx real escrito por SheetJS
try {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú (URL)", "Link del QR"], ["Tropical", "Bar", "1", "", "", MENU, ""], ["Tropical", "Bar", "2", "", "", `${MENU}/2`, ""]]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Mesas");
  const file = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
  const imported = await call("qr-importar-excel", "", { method: "POST", headers: { "content-type": "application/octet-stream", "x-file-name": encodeURIComponent("mesas.xlsx") }, body: file });
  const body = (await imported.json()) as { ok?: boolean; result?: { successful: unknown[] } };
  check("qr-importar-excel: lee un .xlsx real (guard + SheetJS) y devuelve las filas", imported.status === 200 && body.ok === true && body.result?.successful.length === 2, body);
  const hostile = await call("qr-importar-excel", "", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) });
  check("qr-importar-excel: un ZIP hostil se rechaza con 422", hostile.status === 422, hostile.status);
} catch (error) {
  console.warn(`OMITE importar: SheetJS no está disponible aquí (${error instanceof Error ? error.message : error})`);
}

console.warn(failures === 0 ? "\nTodo bien (contra un Supabase simulado)." : `\n${failures} comprobaciones fallaron.`);
process.exit(failures === 0 ? 0 : 1);
