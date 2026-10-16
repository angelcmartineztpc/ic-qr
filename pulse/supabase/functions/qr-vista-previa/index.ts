/**
 * qr-vista-previa — POST: piezas ya dibujadas (contornos de Address Sans Pro Cd) para la vista previa.
 * La tipografía es comercial y solo vive en el servidor (bucket privado `qr-fuentes`): el navegador recibe SVG, nunca la fuente.
 * Nunca genera ni sube nada.
 */
import { runPreview } from "@/services/qr-produccion/backend/preview/request.ts";

import { fontRegistryFor } from "../_shared/fonts.ts";
import { guarded, limits } from "../_shared/guards.ts";
import { qrStorage } from "../_shared/storage.ts";

Deno.serve(
  guarded(
    async (ctx) => {
      const raw = await ctx.readJson();
      const templateId = (raw as { templateId?: unknown } | null)?.templateId;
      const fonts = await fontRegistryFor(typeof templateId === "string" ? templateId : "");
      return Response.json(await runPreview(raw, { fonts, storage: qrStorage() }), { headers: { "Cache-Control": "no-store" } });
    },
    { methods: ["POST"], contentTypes: ["application/json"], rateLimit: limits().preview, maxBody: 1024 * 1024 },
  ),
);
