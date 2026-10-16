import type { DestinationLookup } from "@/services/qr-produccion/backend/stable-link.ts";

import { adminClient } from "./clients.ts";

/** Destino vigente por resort y servicio, de la tabla `qr_destinos_resort` (editable por Admin; antes era código). */
export const dbLookup: DestinationLookup = async (resortCode, service) => {
  const { data, error } = await adminClient().from("qr_destinos_resort").select("destino").eq("resort_codigo", resortCode).eq("servicio", service).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { destino: string } | null)?.destino ?? null;
};
