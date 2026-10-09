import "server-only";

import { getEnv } from "../env";
import { cloudflareBucket } from "../storage/r2";
import { NodeFontRegistry, resolveFontsDir } from "./node-font-registry";

let registry: NodeFontRegistry | undefined;

/** Prefijo del bucket R2 donde `bun run cf:fonts` sube las fuentes (privado: /api/storage no lo sirve). */
const R2_FONTS_PREFIX = "fonts/";

async function fontsFromR2(): Promise<Array<[string, Uint8Array]>> {
  const bucket = await cloudflareBucket();
  const listed = await bucket.list({ prefix: R2_FONTS_PREFIX });
  const files = await Promise.all(
    listed.objects.map(async (entry): Promise<[string, Uint8Array] | null> => {
      const object = await bucket.get(entry.key);
      return object ? [entry.key.slice(R2_FONTS_PREFIX.length), new Uint8Array(await object.arrayBuffer())] : null;
    }),
  );
  return files.filter((file): file is [string, Uint8Array] => file !== null);
}

/** Registro único del proceso (las fuentes se cargan una vez). En Workers vienen de R2; en Node, del disco. */
export function getFontRegistry(): NodeFontRegistry {
  const env = getEnv();
  registry ??= new NodeFontRegistry(resolveFontsDir(env.FONTS_DIR), env.STORAGE_PROVIDER === "r2" ? fontsFromR2 : undefined);
  return registry;
}

/** Igual que `getFontRegistry`, pero espera a que las fuentes remotas estén en memoria. */
export async function getReadyFontRegistry(): Promise<NodeFontRegistry> {
  const ready = getFontRegistry();
  await ready.ready();
  return ready;
}

export { NodeFontRegistry } from "./node-font-registry";
