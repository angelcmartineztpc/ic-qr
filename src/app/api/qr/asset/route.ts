import { ExternalSnapshotSchema } from "@/schemas/qr-geometry";
import { HttpError, getLimits, withApiGuards } from "@/server/http";
import { getStorage } from "@/server/storage";
import { isValidKey } from "@/server/storage/keys";

/** GET /api/qr/asset?key=<snapshotKey> — geometría saneada de un QR existente, para la vista previa. */
export const GET = withApiGuards(
  async (ctx) => {
    const key = new URL(ctx.request.url).searchParams.get("key") ?? "";
    if (!isValidKey(key) || !/\/?qr\/ext\/v\d+\/[0-9a-f]{64}\.json$/.test(key)) throw new HttpError(400, "VALIDATION_FAILED", "Clave de instantánea no válida");

    const object = await getStorage().get(key);
    if (!object) throw new HttpError(404, "NOT_FOUND", "La instantánea no existe");
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(object.body));
    } catch {
      throw new HttpError(422, "VALIDATION_FAILED", "La instantánea está dañada");
    }
    const snapshot = ExternalSnapshotSchema.safeParse(json);
    if (!snapshot.success) throw new HttpError(422, "VALIDATION_FAILED", "La instantánea no es válida");
    return Response.json(snapshot.data.geometry, { headers: { "Cache-Control": "private, max-age=3600" } });
  },
  () => ({ csrf: true, rateLimit: getLimits().asset }),
);
