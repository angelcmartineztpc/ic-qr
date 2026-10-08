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

/**
 * En desarrollo React monta cada efecto dos veces (StrictMode): el primer montaje pide el
 * bloqueo, se desmonta y el segundo lo pide mientras el primero aún lo suelta. Por eso un
 * «no disponible» al arrancar se reintenta unas veces antes de decidir que otra pestaña escribe.
 */
const START_RETRIES = 4;
const RETRY_MS = 40;

export function createWriterLock(onChange: (role: WriterRole) => void, locks: LockManagerLike | undefined, name = "qr-project"): WriterLock {
  let releaseHeld: (() => void) | undefined;
  let disposed = false;

  const hold = (steal: boolean, attempt = 0): Promise<void> =>
    new Promise<void>((resolve) => {
      if (!locks) {
        onChange("owner");
        resolve();
        return;
      }
      const request = locks.request(name, steal ? { mode: "exclusive", steal: true } : { mode: "exclusive", ifAvailable: true }, (lock) => {
        if (!lock) {
          if (!steal && attempt < START_RETRIES && !disposed) {
            setTimeout(() => void hold(false, attempt + 1).then(resolve), RETRY_MS);
            return undefined;
          }
          onChange("read-only");
          resolve();
          return undefined;
        }
        // Si se soltó antes de obtenerlo (desmontaje), se devuelve de inmediato y sin avisar.
        if (disposed) {
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
    release: () => {
      disposed = true;
      releaseHeld?.();
    },
  };
}
