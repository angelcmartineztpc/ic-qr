// Genera src/server/fonts/embedded-fonts.generated.ts con las fuentes de servidor
// (Address Sans Pro Cd) en base64 para que Cloudflare Workers tenga las fuentes en
// memoria incluso cuando no hay un bucket R2 externo configurado.
// El archivo generado está en .gitignore para no versionar fuentes con licencia comercial.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FAMILIES_FOR_SERVER = ["address-sans"];
const entries = [];

for (const family of FAMILIES_FOR_SERVER) {
  const dir = join("assets", "fonts", family);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".woff2")) continue;
    const bytes = readFileSync(join(dir, name));
    entries.push([`${family}/${name}`, bytes.toString("base64")]);
  }
}

const outPath = join("src", "server", "fonts", "embedded-fonts.generated.ts");
const lines = [
  "// Archivo autogenerado por scripts/embed-server-fonts.mjs — NO editar ni versionar en git.",
  "export const EMBEDDED_SERVER_FONTS: ReadonlyArray<readonly [string, string]> = [",
  ...entries.map(([rel, b64]) => `  [${JSON.stringify(rel)}, ${JSON.stringify(b64)}],`),
  "];",
  "",
];

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Fuentes embebidas para servidor (${entries.length}) en ${outPath}`);

