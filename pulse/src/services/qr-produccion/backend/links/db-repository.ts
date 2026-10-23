import { ShortLinkSchema, SHORT_LINK_HISTORY_MAX, type ShortLink } from "@/services/qr-produccion/schemas/links";

import { RevisionConflictError, type ShortLinkRepository } from "./repository";

/** Fila de `qr_enlaces` (ver patch-qr-produccion.sql). */
export interface LinkRow {
  codigo: string;
  destino: string;
  url_original: string;
  revision: number;
  historial: Array<{ destination: string; at: string }>;
  created_at: string;
  updated_at: string;
}

/**
 * Lo único que el repositorio necesita de la tabla. La implementación con supabase-js vive en
 * supabase/functions/_shared/links-table.ts; las pruebas usan una en memoria con las mismas restricciones.
 */
export interface LinksTable {
  select(code: string): Promise<LinkRow | null>;
  /** INSERT … ON CONFLICT DO NOTHING: «exists» si choca el código o la `url_original` (UNIQUE). */
  insert(row: LinkRow): Promise<"created" | "exists">;
  /** UPDATE … WHERE codigo = ? AND revision = ?: null si ya no coincide (alguien se adelantó). */
  updateIfRevision(code: string, expectedRevision: number, patch: Pick<LinkRow, "destino" | "historial" | "revision" | "updated_at">): Promise<LinkRow | null>;
}

export const linkToRow = (link: ShortLink): LinkRow => ({
  codigo: link.code,
  destino: link.destination,
  url_original: link.originalUrl,
  revision: link.revision,
  historial: link.history,
  created_at: link.createdAt,
  updated_at: link.updatedAt,
});

/** Una fila ilegible se trata como inexistente (igual que hacía el repositorio de objetos). */
export function rowToLink(row: LinkRow): ShortLink | null {
  const parsed = ShortLinkSchema.safeParse({
    v: 1,
    code: row.codigo,
    destination: row.destino,
    originalUrl: row.url_original,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    revision: row.revision,
    history: row.historial,
  });
  return parsed.success ? parsed.data : null;
}

const MAX_RETRIES = 3;

export class DbShortLinkRepository implements ShortLinkRepository {
  constructor(private readonly table: LinksTable) {}

  async get(code: string): Promise<ShortLink | null> {
    const row = await this.table.select(code);
    return row ? rowToLink(row) : null;
  }

  create(link: ShortLink): Promise<"created" | "exists"> {
    return this.table.insert(linkToRow(link));
  }

  /**
   * Con `expectedRevision` un cambio ajeno entre medias da conflicto. Sin ella se relee y se reintenta
   * (el último en escribir gana, pero ninguno pierde su entrada del historial).
   */
  async updateDestination(code: string, destination: string, at: string, expectedRevision?: number): Promise<ShortLink | null> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const current = await this.get(code);
      if (!current) return null;
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw new RevisionConflictError();
      const updated = await this.table.updateIfRevision(code, current.revision, {
        destino: destination,
        historial: [{ destination: current.destination, at }, ...current.history].slice(0, SHORT_LINK_HISTORY_MAX),
        revision: current.revision + 1,
        updated_at: at,
      });
      if (updated) return rowToLink(updated);
      if (expectedRevision !== undefined) throw new RevisionConflictError();
    }
    throw new RevisionConflictError();
  }
}
