import { shortUrlFor } from "@/lib/links/own-links";
import { ShortCodeSchema, UpdateDestinationRequestSchema, type LinkInfo, type ShortLink } from "@/schemas/links";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { getLinkDeps } from "@/server/links";
import { getLink, LinkError, updateDestination } from "@/server/links/service";

/** Lo que ve la interfaz: el registro sin su versión interna (`v`) y con el link corto ya armado. */
const infoOf = (link: ShortLink, base: string): LinkInfo => ({
  code: link.code,
  shortUrl: shortUrlFor(base, link.code),
  destination: link.destination,
  originalUrl: link.originalUrl,
  createdAt: link.createdAt,
  updatedAt: link.updatedAt,
  revision: link.revision,
  history: link.history,
});

function asHttp(error: unknown): never {
  if (error instanceof LinkError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : error.code === "EXHAUSTED" ? 503 : 400;
    throw new HttpError(status, error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "EXHAUSTED" ? "INTERNAL" : "VALIDATION_FAILED", error.message);
  }
  throw error;
}

type Ctx = RouteContext<"/api/links/[code]">;

function codeOf(ctx: { route: Ctx }): Promise<string> {
  return ctx.route.params.then(({ code }) => {
    const parsed = ShortCodeSchema.safeParse(code.toLowerCase());
    if (!parsed.success) throw new HttpError(404, "NOT_FOUND", "Este link corto no existe");
    return parsed.data;
  });
}

/** GET /api/links/{código} — destino vigente, link original e historial de un link corto. */
export const GET = withApiGuards<Ctx>(
  async (ctx) => {
    const code = await codeOf(ctx);
    const deps = getLinkDeps(ctx.request);
    try {
      return Response.json(infoOf(await getLink(code, deps), deps.base), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return asHttp(error);
    }
  },
  () => ({ rateLimit: getLimits().links }),
);

/**
 * PATCH /api/links/{código} — cambia a dónde lleva el link. El código (y el QR impreso) no cambia.
 * `If-Match: {revisión}` es opcional: con él, un cambio hecho por otra persona entre medias da 409.
 */
export const PATCH = withApiGuards<Ctx>(
  async (ctx) => {
    const code = await codeOf(ctx);
    const parsed = UpdateDestinationRequestSchema.safeParse(await ctx.readJson());
    if (!parsed.success) throw new HttpError(400, "VALIDATION_FAILED", "Petición no válida", parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })));
    const ifMatch = ctx.request.headers.get("if-match");
    const revision = ifMatch === null ? undefined : Number(ifMatch.replaceAll('"', ""));
    if (revision !== undefined && !Number.isInteger(revision)) throw new HttpError(400, "VALIDATION_FAILED", "If-Match debe ser el número de revisión");
    const deps = getLinkDeps(ctx.request);
    try {
      return Response.json(infoOf(await updateDestination(code, parsed.data.destination, deps, revision), deps.base), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return asHttp(error);
    }
  },
  () => ({ contentTypes: ["application/json"], rateLimit: getLimits().links }),
);
