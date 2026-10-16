/**
 * qr-resolver — ÚNICO productor de QR.
 *   POST  (JSON {items, verify}): genera (o reutiliza) el QR de los registros SIN Link del QR y verifica el de los
 *         que lo traen. REGLA CRÍTICA: un registro con Link del QR nunca genera uno nuevo (se rechaza en el servidor).
 *   GET   /storage/{clave}.svg   PÚBLICA: sirve el SVG de un QR generado (el `qrUrl` debe abrirse fuera de la app).
 */
import { contentTypeForKey, isValidKey } from "@/services/qr-produccion/backend/storage/keys.ts";
import { runQrResolve } from "@/services/qr-produccion/backend/qr/resolve-request.ts";

import { guarded, limits } from "../_shared/guards.ts";
import { qrServices } from "../_shared/services.ts";
import { qrStorage } from "../_shared/storage.ts";

const resolve = guarded(
  async (ctx) => {
    const services = await qrServices((ctx.principal as { userId: string }).userId);
    return Response.json(await runQrResolve(await ctx.readJson(), services), { headers: { "Cache-Control": "no-store" } });
  },
  { methods: ["POST"], contentTypes: ["application/json"], rateLimit: limits().resolve, maxBody: 512 * 1024 },
);

const notFound = () => new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

/** Pública y sin sesión: la abren quienes escanean. Solo claves con la forma exacta de un QR (nada de instantáneas ni logos). */
const publicQr = guarded(
  async (ctx) => {
    const marker = "/storage/";
    const key = (() => {
      try {
        return decodeURIComponent(ctx.url.pathname.slice(ctx.url.pathname.indexOf(marker) + marker.length));
      } catch {
        return "";
      }
    })();
    if (!isValidKey(key) || !key.endsWith(".svg")) return notFound();
    const object = await qrStorage().get(key);
    if (!object) return notFound();

    // Clave por contenido: el archivo nunca cambia, así que la clave es su ETag.
    const etag = `"${key.split("/").pop()?.replace(".svg", "")}"`;
    const headers = new Headers({
      "Content-Type": contentTypeForKey(key),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // El SVG se muestra pero no puede ejecutar nada ni cargar recursos.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": `inline; filename="${key.split("/").pop() ?? "qr.svg"}"`,
      ETag: etag,
    });
    if (ctx.request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(object.body as unknown as BodyInit, { status: 200, headers });
  },
  { auth: false, methods: ["GET", "HEAD"], rateLimit: limits().publicRead },
);

Deno.serve((request) => (new URL(request.url).pathname.includes("/storage/") ? publicQr(request) : resolve(request)));
