import type { LinkRow, LinksTable } from "../links/db-repository";

/** Tabla `qr_enlaces` en memoria, con sus mismas restricciones (PK en `codigo`, UNIQUE en `url_original`). */
export class MemoryLinksTable implements LinksTable {
  readonly rows = new Map<string, LinkRow>();
  /** Retardo artificial para provocar carreras entre llamadas concurrentes. */
  delayMs = 0;

  private async tick(): Promise<void> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
  }

  async select(code: string): Promise<LinkRow | null> {
    await this.tick();
    const row = this.rows.get(code);
    return row ? structuredClone(row) : null;
  }

  async insert(row: LinkRow): Promise<"created" | "exists"> {
    await this.tick();
    if (this.rows.has(row.codigo) || [...this.rows.values()].some((r) => r.url_original === row.url_original)) return "exists";
    this.rows.set(row.codigo, structuredClone(row));
    return "created";
  }

  async updateIfRevision(code: string, expectedRevision: number, patch: Pick<LinkRow, "destino" | "historial" | "revision" | "updated_at">): Promise<LinkRow | null> {
    await this.tick();
    const row = this.rows.get(code);
    if (!row || row.revision !== expectedRevision) return null;
    const next = { ...row, ...structuredClone(patch) };
    this.rows.set(code, next);
    return structuredClone(next);
  }
}
