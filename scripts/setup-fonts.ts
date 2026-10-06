/**
 * Gotham (Hoefler & Co.) tiene licencia comercial y no se versiona en git.
 * Este script copia los pesos que usan las plantillas desde una carpeta local
 * a assets/fonts/gotham y verifica su integridad contra manifest.json.
 *
 *   bun run fonts:setup                          (por defecto ~/Library/Fonts)
 *   FONTS_SOURCE_DIR=/ruta/a/gotham npm run fonts:setup
 *   bun run fonts:setup --write-manifest         (actualiza el manifest; solo al cambiar de versión)
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface FontManifest {
  family: string;
  version: string;
  license: string;
  files: Record<string, { weight: number; sha256: string }>;
}

const targetDir = fileURLToPath(new URL("../assets/fonts/gotham/", import.meta.url));
const manifestPath = join(targetDir, "manifest.json");
const sourceDir = process.env.FONTS_SOURCE_DIR ?? join(homedir(), "Library", "Fonts");
const writeManifest = process.argv.includes("--write-manifest");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FontManifest;
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

mkdirSync(targetDir, { recursive: true });
let failures = 0;

for (const [file, info] of Object.entries(manifest.files)) {
  const source = join(sourceDir, file);
  const target = join(targetDir, file);
  if (!existsSync(source)) {
    if (existsSync(target) && sha256(target) === info.sha256) {
      console.log(`✓ ${file} (ya instalada)`);
      continue;
    }
    console.error(`✕ ${file}: no está en ${sourceDir}`);
    failures++;
    continue;
  }
  const hash = sha256(source);
  if (writeManifest) {
    info.sha256 = hash;
  } else if (info.sha256 && hash !== info.sha256) {
    console.error(`✕ ${file}: el archivo no coincide con manifest.json (¿otra versión de Gotham?). Usa --write-manifest si es intencional.`);
    failures++;
    continue;
  }
  copyFileSync(source, target);
  console.log(`✓ ${file}`);
}

if (writeManifest) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("manifest.json actualizado");
}
if (failures > 0) {
  console.error(`\n${failures} fuente(s) sin instalar. Las piezas no se pueden renderizar sin Gotham.`);
  process.exit(1);
}
