/**
 * Un solo escritor entre pestañas (§S6): `navigator.locks` con un bloqueo
 * exclusivo. La pestaña que lo obtiene escribe; las demás quedan en solo
 * lectura con la opción de tomar el control (`steal`). Web Locks exige
 * contexto seguro; sin él se asume una sola pestaña y se informa.
 */
export interface LockManagerLike {
  request(name: string, options: { mode?: "exclusive"; ifAvailable?: boolean; steal?: boolean }, callback: (lock: unknown) => Promise<unknown> | unknown): Promise<unknown>;
}

export type WriterRole = "owner" | "read-only";

export interface WriterLock {
  /** Pide el bloqueo sin esperar. */
  start(): Promise<void>;
  /** «Tomar el control»: expulsa a la pestaña que escribía. */
  takeOver(): Promise<void>;
  /** ¿Hay Web Locks? Sin ellos no se puede garantizar un único escritor. */
  readonly supported: boolean;
  release(): void;
}

export function createWriterLock(onChange: (role: WriterRole) => void, locks: LockManagerLike | undefined, name = "qr-project"): WriterLock {
  let releaseHeld: (() => void) | undefined;

  const hold = (steal: boolean): Promise<void> =>
    new Promise<void>((resolve) => {
      if (!locks) {
        onChange("owner");
        resolve();
        return;
      }
      const request = locks.request(name, steal ? { mode: "exclusive", steal: true } : { mode: "exclusive", ifAvailable: true }, (lock) => {
        if (!lock) {
          onChange("read-only");
          resolve();
          return undefined;
        }
        onChange("owner");
        resolve();
        // Se mantiene el bloqueo mientras la promesa siga pendiente.
        return new Promise<void>((release) => {
          releaseHeld = release;
        });
      });
      // Si otra pestaña nos roba el bloqueo, la petición se rechaza con AbortError.
      Promise.resolve(request).catch(() => {
        onChange("read-only");
        resolve();
      });
    });

  return {
    supported: locks !== undefined,
    start: () => hold(false),
    takeOver: () => hold(true),
    release: () => releaseHeld?.(),
  };
}
