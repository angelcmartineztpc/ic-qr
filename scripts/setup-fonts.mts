/**
 * Gotham (interfaz) y Address Sans Pro Cd (piezas) tienen licencia comercial y
 * no se versionan en git. Este script copia los archivos desde una carpeta local
 * a assets/fonts/<familia> y verifica su integridad contra manifest.json.
 *
 *   bun run fonts:setup                          (por defecto ~/Library/Fonts; los archivos son .woff2)
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

const sourceDir = process.env.FONTS_SOURCE_DIR ?? join(homedir(), "Library", "Fonts");
const writeManifest = process.argv.includes("--write-manifest");
const FAMILIES = ["gotham", "address-sans"];

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

let failures = 0;
for (const family of FAMILIES) {
  const targetDir = fileURLToPath(new URL(`../assets/fonts/${family}/`, import.meta.url));
  const manifestPath = join(targetDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FontManifest;
  mkdirSync(targetDir, { recursive: true });

  for (const [file, info] of Object.entries(manifest.files)) {
    const target = join(targetDir, file);
    if (existsSync(target) && sha256(target) === info.sha256 && !writeManifest) {
      console.log(`✓ ${family}/${file} (ya instalada)`);
      continue;
    }
    const source = existsSync(join(sourceDir, file)) ? join(sourceDir, file) : null;
    if (!source) {
      console.error(`✕ ${family}/${file}: no está en ${sourceDir} (define FONTS_SOURCE_DIR con la carpeta que tiene los .woff2)`);
      failures++;
      continue;
    }
    const hash = sha256(source);
    if (writeManifest) {
      info.sha256 = hash;
    } else if (info.sha256 && hash !== info.sha256) {
      console.error(`✕ ${family}/${file}: el archivo no coincide con manifest.json (¿otra versión?). Usa --write-manifest si es intencional.`);
      failures++;
      continue;
    }
    copyFileSync(source, target);
    console.log(`✓ ${family}/${file}`);
  }
  if (writeManifest) {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${family}/manifest.json actualizado`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} fuente(s) sin instalar. La interfaz (Gotham) y las piezas (Address Sans Pro Cd) las necesitan.`);
  process.exit(1);
}
