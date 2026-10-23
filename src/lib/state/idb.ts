import { clear, createStore, del, get, set } from "idb-keyval";

import type { KeyValueStore } from "./persistence";

/** Adaptador de IndexedDB (solo navegador). La base se crea al primer uso. */
export function createIdbStore(): KeyValueStore {
  let store: ReturnType<typeof createStore> | undefined;
  const open = () => (store ??= createStore("qr-production-generator", "project"));
  return {
    get: (key) => get(key, open()),
    set: (key, value) => set(key, value, open()),
    del: (key) => del(key, open()),
  };
}

/** Sin persistencia: no guarda ni devuelve nada. */
export const noStore: KeyValueStore = { get: async () => undefined, set: async () => undefined, del: async () => undefined };

/** Borra lo que versiones anteriores dejaron guardado en este navegador (proyecto, última importación y copias). */
export async function clearLegacyStore(): Promise<void> {
  try {
    await clear(createStore("qr-production-generator", "project"));
  } catch {
    /* sin IndexedDB no hay nada que borrar */
  }
}
