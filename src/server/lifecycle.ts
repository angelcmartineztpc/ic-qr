/**
 * Estado de apagado ordenado. Con SIGTERM la app deja de aceptar exportaciones
 * nuevas (503) y /api/health responde 503, mientras termina lo que está en curso.
 *
 * Se guarda en globalThis porque instrumentation.ts y los Route Handlers se
 * empaquetan por separado y no comparten instancias de módulo.
 * Sin `server-only`: instrumentation.ts no corre en la capa react-server.
 */
const KEY = Symbol.for("qr-production-generator.draining");

type LifecycleGlobal = typeof globalThis & { [KEY]?: boolean };

export function isDraining(): boolean {
  return (globalThis as LifecycleGlobal)[KEY] === true;
}

export function startDraining(): void {
  (globalThis as LifecycleGlobal)[KEY] = true;
}
