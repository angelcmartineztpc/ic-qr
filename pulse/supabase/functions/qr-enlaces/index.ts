/**
 * qr-enlaces — acortador de links del menú.
 *   POST shorten                 acorta una lista (máx. 200); idempotente
 *   GET|PATCH links/{código}     consultar / cambiar el destino (con historial; If-Match opcional → 409)
 *   POST records-excel           el Excel actualizado del proyecto
 *   GET s/{código}               PÚBLICA: 302 al destino vigente (la URL grabada en el QR)
 *   GET api/qr/{resort}/{servicio}  PÚBLICA: 302 al destino del resort (misma ruta que imprimía la app Next.js)
 */
import { HttpError } from "@/services/qr-produccion/backend/http/errors.ts";
import { parseBody } from "@/services/qr-produccion/backend/http/validate.ts";
import { DbShortLinkRepository } from "@/services/qr-produccion/backend/links/db-repository.ts";
import { buildUpdatedRows, EXCEL_COLUMN_WIDTHS, EXCEL_SHEET_NAME } from "@/services/qr-produccion/backend/links/excel-rows.ts";
import { RedirectCache } from "@/services/qr-produccion/backend/links/redirect-cache.ts";
import { redirectResponse, resolveRedirect } from "@/services/qr-produccion/backend/links/redirect.ts";
import { infoOf, linkBase, linkErrorToHttp, ownHostsOf, revisionFromIfMatch, routeLinks, validCode } from "@/services/qr-produccion/backend/links/routes.ts";
import { getLink, shortenUrls, updateDestination, type LinkDeps } from "@/services/qr-produccion/backend/links/service.ts";
import { parseStablePath, resolveStable, stableResponse } from "@/services/qr-produccion/backend/stable-link.ts";
import { RecordsExcelRequestSchema, ShortenRequestSchema, UpdateDestinationRequestSchema } from "@/services/qr-produccion/schemas/links.ts";

import { getConfig } from "../_shared/config.ts";
import { guarded, limits } from "../_shared/guards.ts";
import { linksTable } from "../_shared/links-table.ts";
import { dbLookup } from "../_shared/stable.ts";
import { writeWorkbook } from "../_shared/xlsx-reader.ts";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NO_STORE = { "Cache-Control": "no-store" } as const;
const { env, linksFallbackBase } = getConfig();
const redirectCache = new RedirectCache();

/** Dominio sobre el que se arma el link corto: el PERMANENTE configurado (queda grabado en las piezas) o la URL de esta función. */
function linkDeps(userId?: string): LinkDeps {
  const base = linkBase(env.QR_PUBLIC_BASE, linksFallbackBase);
  return { repo: new DbShortLinkRepository(linksTable(userId)), base, ownHosts: ownHostsOf(base), now: () => new Date().toISOString(), onChanged: (code) => redirectCache.delete(code) };
}

const userIdOf = (principal: unknown) => (principal as { userId: string }).userId;
/** HEAD se atiende como GET (sin cuerpo). */
const methodOf = (request: Request) => (request.method === "HEAD" ? "GET" : request.method);

// Públicas: solo leen, sin sesión (las abren los huéspedes al escanear).
const publicRoutes = guarded(
  async (ctx) => {
    const route = routeLinks(methodOf(ctx.request), ctx.url.pathname);
    if (route.kind === "redirect") return redirectResponse(await resolveRedirect(route.code, { repo: linkDeps().repo, cache: redirectCache }));
    return stableResponse(await resolveStable(parseStablePath(ctx.url.pathname, "qr-enlaces"), dbLookup));
  },
  { auth: false, methods: ["GET", "HEAD"], rateLimit: limits().publicRead },
);

const lightRoutes = guarded(
  async (ctx) => {
    const route = routeLinks(methodOf(ctx.request), ctx.url.pathname);
    const deps = linkDeps(userIdOf(ctx.principal));
    switch (route.kind) {
      case "shorten": {
        const { urls } = parseBody(ShortenRequestSchema, await ctx.readJson(), "Petición de acortado no válida");
        try {
          return Response.json({ results: await shortenUrls(urls, deps) }, { headers: NO_STORE });
        } catch (error) {
          return linkErrorToHttp(error);
        }
      }
      case "info": {
        try {
          return Response.json(infoOf(await getLink(validCode(route.code), deps), deps.base), { headers: NO_STORE });
        } catch (error) {
          return linkErrorToHttp(error);
        }
      }
      case "update": {
        const code = validCode(route.code);
        const { destination } = parseBody(UpdateDestinationRequestSchema, await ctx.readJson(), "Petición no válida", 5);
        const revision = revisionFromIfMatch(ctx.request.headers.get("if-match"));
        try {
          return Response.json(infoOf(await updateDestination(code, destination, deps, revision), deps.base), { headers: NO_STORE });
        } catch (error) {
          return linkErrorToHttp(error);
        }
      }
      default:
        throw new HttpError(404, "NOT_FOUND", "Ruta no encontrada");
    }
  },
  { methods: ["GET", "POST", "PATCH"], contentTypes: ["application/json"], rateLimit: limits().links, maxBody: 1024 * 1024 },
);

const excelRoute = guarded(
  async (ctx) => {
    const { records } = parseBody(RecordsExcelRequestSchema, await ctx.readJson(), "Petición no válida");
    const { header, rows } = await buildUpdatedRows(records, linkDeps(userIdOf(ctx.principal)));
    const bytes = writeWorkbook(EXCEL_SHEET_NAME, header, rows, EXCEL_COLUMN_WIDTHS);
    return new Response(bytes as unknown as BodyInit, { status: 200, headers: { "Content-Type": XLSX_MIME, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  },
  { methods: ["POST"], contentTypes: ["application/json"], rateLimit: limits().links, maxBody: 8 * 1024 * 1024 },
);

Deno.serve((request) => {
  const route = routeLinks(methodOf(request), new URL(request.url).pathname);
  if (route.kind === "redirect" || route.kind === "stable") return publicRoutes(request);
  return route.kind === "records-excel" ? excelRoute(request) : lightRoutes(request);
});
