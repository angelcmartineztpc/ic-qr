import type { LinkRow, LinksTable } from "@/services/qr-produccion/backend/links/db-repository.ts";

import { adminClient } from "./clients.ts";

/** Tabla `qr_enlaces` vía service role. `createdBy` queda en la fila al crear (auditoría). */
export function linksTable(createdBy?: string): LinksTable {
  return {
    async select(code) {
      const { data, error } = await adminClient().from("qr_enlaces").select("codigo, destino, url_original, revision, historial, created_at, updated_at").eq("codigo", code).maybeSingle();
      if (error) throw new Error(error.message);
      return data as LinkRow | null;
    },
    async insert(row) {
      const { error } = await adminClient()
        .from("qr_enlaces")
        .insert({ ...row, created_by: createdBy ?? null });
      if (!error) return "created";
      if (error.code === "23505") return "exists"; // unique_violation: el código o la url_original ya existen
      throw new Error(error.message);
    },
    async updateIfRevision(code, expectedRevision, patch) {
      const { data, error } = await adminClient().from("qr_enlaces").update(patch).eq("codigo", code).eq("revision", expectedRevision).select("codigo, destino, url_original, revision, historial, created_at, updated_at").maybeSingle();
      if (error) throw new Error(error.message);
      return data as LinkRow | null;
    },
  };
}
