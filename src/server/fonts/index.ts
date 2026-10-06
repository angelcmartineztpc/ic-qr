import "server-only";

import { getEnv } from "../env";
import { NodeFontRegistry, resolveFontsDir } from "./node-font-registry";

let registry: NodeFontRegistry | undefined;

/** Registro único del proceso (las fuentes se cargan una vez). */
export function getFontRegistry(): NodeFontRegistry {
  registry ??= new NodeFontRegistry(resolveFontsDir(getEnv().FONTS_DIR));
  return registry;
}

export { NodeFontRegistry } from "./node-font-registry";
