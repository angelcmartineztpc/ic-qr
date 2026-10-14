/**
 * Caché en memoria del destino de cada código (≈ 30 s). Cada escaneo es una lectura al storage;
 * así un QR muy escaneado no la repite, y un cambio de destino se propaga en ese tiempo.
 * Por proceso: con varias réplicas cada una tarda hasta el TTL en enterarse.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

interface Entry {
  destination: string | null;
  expires: number;
}

export class RedirectCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = TTL_MS,
  ) {}

  /** `undefined` = no está en caché; `null` = se sabe que no existe. */
  get(code: string): string | null | undefined {
    const entry = this.entries.get(code);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(code);
      return undefined;
    }
    return entry.destination;
  }

  set(code: string, destination: string | null): void {
    if (this.entries.size >= MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value as string);
    this.entries.set(code, { destination, expires: this.now() + this.ttlMs });
  }

  delete(code: string): void {
    this.entries.delete(code);
  }
}
