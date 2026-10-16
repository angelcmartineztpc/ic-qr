import { createStore, del, get, set } from "idb-keyval";

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
