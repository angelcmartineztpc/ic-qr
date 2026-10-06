/**
 * Semáforo sin cola: si no hay hueco se rechaza de inmediato (429), para no
 * retener cuerpos de petición en memoria mientras se espera.
 */
export class Semaphore {
  private active = 0;

  constructor(readonly capacity: number) {}

  /** Devuelve una función de liberación idempotente, o null si está lleno. */
  tryAcquire(): (() => void) | null {
    if (this.active >= this.capacity) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }

  get inUse(): number {
    return this.active;
  }
}
