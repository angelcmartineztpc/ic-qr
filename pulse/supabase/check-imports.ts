/**
 * Comprueba que el grafo de importaciones de cada Edge Function se resuelve (alias `@/`, rutas relativas,
 * extensiones) SIN Deno: `bun supabase/check-imports.ts`. No ejecuta nada ni sustituye a `deno check`:
 * solo detecta archivos que faltan o rutas mal escritas. Los paquetes que Deno trae por `npm:`/`jsr:`/https
 * (ver functions/import_map.json) se marcan como externos.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "functions");
const functions = readdirSync(root).filter((name) => !name.startsWith("_") && statSync(join(root, name)).isDirectory());

let failed = false;
for (const name of functions) {
  const result = await Bun.build({
    entrypoints: [join(root, name, "index.ts")],
    target: "bun",
    external: ["pdfkit", "fontkit", "xlsx", "@supabase/supabase-js", "node:*"],
    tsconfig: join(import.meta.dir, "..", "tsconfig.json"),
    write: false,
  });
  if (result.success) {
    console.warn(`ok     ${name} (${result.outputs.length} salida, ${Math.round((result.outputs[0]?.size ?? 0) / 1024)} KB)`);
  } else {
    failed = true;
    console.error(`FALLA  ${name}`);
    for (const log of result.logs) console.error(`  ${log.message}`);
  }
}
process.exit(failed ? 1 : 0);
