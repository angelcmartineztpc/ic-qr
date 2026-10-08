import { describe, expect, it } from "vitest";

import { createWriterLock, type LockManagerLike, type WriterRole } from "./tab-lock";

/** Web Locks mínimo: exclusivo, ifAvailable y steal (lo que usa la app). */
function fakeLocks(): LockManagerLike {
  let holder: { reject: (e: Error) => void; release: () => void } | null = null;
  return {
    request(_name, options, callback) {
      return new Promise((resolve, reject) => {
        if (holder && options.ifAvailable) {
          resolve(callback(null));
          return;
        }
        if (holder && options.steal) holder.reject(Object.assign(new Error("stolen"), { name: "AbortError" }));
        const run = Promise.resolve(callback({}));
        holder = { reject, release: () => resolve(undefined) };
        void run.then(() => {
          holder = null;
          resolve(undefined);
        });
      });
    },
  };
}

describe("un solo escritor entre pestañas", () => {
  it("la primera pestaña escribe; la segunda queda en solo lectura", async () => {
    const locks = fakeLocks();
    const roles: Record<string, WriterRole[]> = { a: [], b: [] };
    const a = createWriterLock((r) => roles.a?.push(r), locks);
    const b = createWriterLock((r) => roles.b?.push(r), locks);
    await a.start();
    await b.start();
    expect(roles).toEqual({ a: ["owner"], b: ["read-only"] });
  });

  it("«Tomar el control» expulsa a la pestaña que escribía", async () => {
    const locks = fakeLocks();
    const roles: Record<string, WriterRole[]> = { a: [], b: [] };
    const a = createWriterLock((r) => roles.a?.push(r), locks);
    const b = createWriterLock((r) => roles.b?.push(r), locks);
    await a.start();
    await b.start();
    await b.takeOver();
    await Promise.resolve();
    expect(roles.b).toEqual(["read-only", "owner"]);
    expect(roles.a).toEqual(["owner", "read-only"]);
  });

  it("liberar el bloqueo permite que otra pestaña lo obtenga", async () => {
    const locks = fakeLocks();
    const roles: WriterRole[] = [];
    const a = createWriterLock(() => undefined, locks);
    await a.start();
    a.release();
    await Promise.resolve();
    await createWriterLock((r) => roles.push(r), locks).start();
    expect(roles).toEqual(["owner"]);
  });

  it("sin Web Locks (contexto no seguro) se asume una pestaña y se avisa de que no está garantizado", async () => {
    const roles: WriterRole[] = [];
    const lock = createWriterLock((r) => roles.push(r), undefined);
    await lock.start();
    expect(roles).toEqual(["owner"]);
    expect(lock.supported).toBe(false);
  });
});

describe("montaje doble de React en desarrollo (StrictMode)", () => {
  it("un montaje que se desmonta antes de obtener el bloqueo lo devuelve sin avisar, y el segundo escribe", async () => {
    // Como el navegador real: el bloqueo se concede de forma asíncrona, no dentro de request().
    const base = fakeLocks();
    const locks: LockManagerLike = { request: (name, options, callback) => Promise.resolve().then(() => base.request(name, options, callback)) };
    const first: WriterRole[] = [];
    const second: WriterRole[] = [];
    const a = createWriterLock((role) => first.push(role), locks);
    const started = a.start(); // pide el bloqueo…
    a.release(); // …y se desmonta antes de recibirlo
    const b = createWriterLock((role) => second.push(role), locks);
    await Promise.all([started, b.start()]);
    expect(first).toEqual([]); // el montaje descartado no cambia el estado
    expect(second).toEqual(["owner"]); // el definitivo no se queda en solo lectura
    b.release();
  });

  it("si de verdad hay otra pestaña, tras los reintentos queda en solo lectura", async () => {
    const locks = fakeLocks();
    const owner = createWriterLock(() => undefined, locks);
    await owner.start();
    const roles: WriterRole[] = [];
    await createWriterLock((role) => roles.push(role), locks).start();
    expect(roles).toEqual(["read-only"]);
    owner.release();
  });
});
