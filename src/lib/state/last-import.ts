import { z } from "zod";

import { ImportResultSchema } from "@/schemas/import";
import type { ImportResult } from "@/types";

import type { KeyValueStore } from "./persistence";

/** Clave IndexedDB del último resultado de importación (§S1.9): sobrevive a cerrar el diálogo y a recargar. */
export const LAST_IMPORT_KEY = "last-import";

const LastImportSchema = z.strictObject({
  result: ImportResultSchema,
  outcome: z.strictObject({ created: z.number().int().nonnegative(), discarded: z.number().int().nonnegative(), fixes: z.number().int().nonnegative(), discardedRows: z.array(z.number().int().positive()) }).nullable(),
});

export interface ImportOutcomeSummary {
  created: number;
  discarded: number;
  fixes: number;
  /** Filas de Excel que no se importaron por duplicadas (para el informe CSV). */
  discardedRows: number[];
}

export interface LastImport {
  result: ImportResult;
  outcome: ImportOutcomeSummary | null;
}

/** Tolerante: si lo guardado no se entiende, se ignora (nunca bloquea el arranque). */
export async function loadLastImport(kv: KeyValueStore): Promise<LastImport | null> {
  try {
    const parsed = LastImportSchema.safeParse(await kv.get(LAST_IMPORT_KEY));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveLastImport(kv: KeyValueStore, value: LastImport): Promise<void> {
  await kv.set(LAST_IMPORT_KEY, value);
}

export async function clearLastImport(kv: KeyValueStore): Promise<void> {
  await kv.del(LAST_IMPORT_KEY);
}
