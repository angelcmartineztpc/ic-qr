import type { ProjectPatch, ProjectRow, ProjectTable } from "@/services/qr-produccion/state/remote-persistence";

/** `qr_proyectos` en memoria: el UPDATE exige la revisión esperada y la sube (como el trigger del SQL). `offline` simula perder la red. */
export class MemoryProjectTable implements ProjectTable {
  rows = new Map<string, ProjectRow>();
  offline = false;
  constructor(private readonly now: string) {}

  private guard() {
    if (this.offline) throw new TypeError("fetch failed");
  }
  async get(id: string) {
    this.guard();
    return structuredClone(this.rows.get(id) ?? null);
  }
  async latestMine() {
    this.guard();
    return structuredClone([...this.rows.values()][0] ?? null);
  }
  async insert(row: ProjectPatch & { id: string }) {
    this.guard();
    if (this.rows.has(row.id)) return "exists" as const;
    const stored: ProjectRow = { ...structuredClone(row), revision: 1, owner_id: "u1", updated_at: this.now };
    this.rows.set(row.id, stored);
    return structuredClone(stored);
  }
  async updateIfRevision(id: string, expectedRevision: number, patch: ProjectPatch) {
    this.guard();
    const row = this.rows.get(id);
    if (!row || row.revision !== expectedRevision) return null;
    const next: ProjectRow = { ...row, ...structuredClone(patch), revision: row.revision + 1 };
    this.rows.set(id, next);
    return structuredClone(next);
  }
}
