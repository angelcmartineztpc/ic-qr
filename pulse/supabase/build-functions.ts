/**
 * Empaqueta cada Edge Function en dist/<nombre>/index.js (`bun supabase/build-functions.ts`).
 *
 * Por qué: el código compartido de src/ usa imports sin extensión (`./messages.es`) y el alias `@/`. El CLI de Supabase
 * (Go) recorre los imports para montar los archivos y falla con ellos («failed to read file … messages.es»). Empaquetar
 * deja un único archivo por función; solo quedan como imports las librerías, que resuelve dist/import_map.json.
 * `config.toml` apunta cada función a su entrypoint en dist/.
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = import.meta.dir;
const importMap = (await Bun.file(join(root, "functions/import_map.json")).json()) as { imports: Record<string, string> };
// Solo las librerías (las rutas @/ y ../../src las resuelve el empaquetado).
const libs = Object.fromEntries(Object.entries(importMap.imports).filter(([key]) => !key.startsWith("@/")));
const external = [...Object.keys(libs).filter((k) => !k.endsWith("/")), "node:*"];

const names = (await readdir(join(root, "functions"), { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith("_")).map((e) => e.name);
for (const name of names) {
  const result = await Bun.build({
    entrypoints: [join(root, "functions", name, "index.ts")],
    outdir: join(root, "dist", name),
    naming: "index.js",
    target: "browser", // sin APIs de Node: es Deno
    format: "esm",
    external,
    tsconfig: join(root, "../tsconfig.json"),
    define: { "import.meta.env": "undefined" }, // el código compartido lee import.meta.env en el navegador; en Deno no existe
  });
  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    process.exit(1);
  }
  // El runtime local de Supabase no aplicó el import_map de la función: se escriben ya los especificadores finales (npm:, jsr:, https:).
  const file = join(root, "dist", name, "index.js");
  let code = await Bun.file(file).text();
  for (const [key, target] of Object.entries(libs)) {
    if (key.endsWith("/")) code = code.replaceAll(new RegExp(`(from\\s*|import\\()"${key.replace(/[/@.]/g, "\\$&")}`, "g"), `$1"${target.replace("npm:/", "npm:")}`);
    else code = code.replaceAll(new RegExp(`(from\\s*|import\\()"${key.replace(/[/@.]/g, "\\$&")}"`, "g"), `$1"${target}"`);
  }
  await Bun.write(file, code);
  console.warn(`✓ ${name}`);
}
await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist/import_map.json"), JSON.stringify({ imports: {} }, null, 2) + "\n"); // vacío: ya no hace falta
