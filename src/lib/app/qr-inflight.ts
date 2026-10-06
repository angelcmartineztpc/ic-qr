import type { RecordId } from "@/types";

/**
 * Trabajos de QR en curso por registro (no serializable, por eso vive fuera
 * del store). Un segundo disparo para un registro ya en vuelo se ignora; si el
 * usuario edita la pieza mientras tanto, el resultado se descarta (guarda de aplicación).
 */
export class QrInflight {
  private readonly active = new Map<RecordId, { controller: AbortController; cancelled: boolean }>();
  private readonly listeners = new Set<(ids: RecordId[]) => void>();

  isBusy(id: RecordId): boolean {
    return this.active.has(id);
  }

  /** Marca el registro como en curso; false si ya lo estaba. */
  begin(id: RecordId, controller: AbortController): boolean {
    if (this.active.has(id)) return false;
    this.active.set(id, { controller, cancelled: false });
    this.emit();
    return true;
  }

  end(id: RecordId): void {
    if (this.active.delete(id)) this.emit();
  }

  /** El registro cambió: su resultado, cuando llegue, ya no vale. */
  invalidate(id: RecordId): void {
    const job = this.active.get(id);
    if (job) job.cancelled = true;
  }

  wasCancelled(id: RecordId): boolean {
    return this.active.get(id)?.cancelled ?? false;
  }

  /** Cancelar todo (botón «Cancelar»): se aborta la petición en curso. */
  abortAll(): void {
    for (const job of this.active.values()) {
      job.cancelled = true;
      job.controller.abort();
    }
  }

  ids(): RecordId[] {
    return [...this.active.keys()];
  }

  subscribe(listener: (ids: RecordId[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const ids = this.ids();
    for (const listener of this.listeners) listener(ids);
  }
}
