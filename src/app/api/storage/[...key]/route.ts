import { getEnv } from "@/server/env";
import { getStorage } from "@/server/storage";
import { contentTypeForKey, isValidKey } from "@/server/storage/keys";

const notFound = () => new Response("No encontrado", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/storage/qr/v1/{sha256}.svg — SOLO con STORAGE_PROVIDER=local o r2.
 * Es público y no pide autenticación (los qrUrl deben abrirse fuera de la app);
 * solo sirve claves con la forma exacta de un QR o una instantánea. Con un
 * proveedor S3 el bucket sirve los archivos y esta ruta no existe; con r2 el bucket es privado
 * y esta ruta es la que sirve los archivos.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/storage/[...key]">) {
  if (getEnv().STORAGE_PROVIDER === "s3") return notFound();
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isValidKey(key)) return notFound();

  const object = await getStorage().get(key);
  if (!object) return notFound();

  const etag = object.etag ? `"${object.etag}"` : undefined;
  const headers = new Headers({
    "Content-Type": contentTypeForKey(key),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    // El SVG se muestra pero no puede ejecutar nada ni cargar recursos.
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Disposition": `inline; filename="${key.split("/").pop() ?? "qr"}"`,
    ...(etag ? { ETag: etag } : {}),
  });
  if (etag && request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(Buffer.from(object.body), { status: 200, headers });
}
