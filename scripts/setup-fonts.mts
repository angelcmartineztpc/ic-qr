/**
 * Gotham (interfaz) y Address Sans Pro Cd (piezas) tienen licencia comercial y
 * no se versionan en git. Este script instala los archivos .woff2 en
 * assets/fonts/<familia> y verifica cada uno contra manifest.json:
 *
 *  1. Busca la fuente por su nombre PostScript en SOURCE_DIR (por defecto
 *     ~/Library/Fonts) y en la caché de Adobe Fonts (CoreSync/livetype).
 *  2. Si la encuentra en otf/ttf (o con el nombre opaco de la caché de Adobe) la
 *     convierte a .woff2; si ya es .woff2 la copia.
 *  3. Comprueba la huella de anchos del manifest: un archivo con el nombre correcto
 *     pero de otro ancho (p. ej. Address Sans SemiBold en lugar de la Cd) se rechaza.
 *
 *   bun run fonts:setup                          (SOURCE_DIR = ~/Library/Fonts)
 *   FONTS_SOURCE_DIR=/ruta/a/fuentes bun run fonts:setup
 *   bun run fonts:setup --write-manifest         (fija el sha256 de lo instalado; solo al cambiar de versión)
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import * as fontkit from "fontkit";
import wawoff2 from "wawoff2";

import { advanceMismatches, scanFonts, type FontCandidate, type FontEntry } from "./fonts-lib.mjs";

interface FontManifest {
  family: string;
  version: string;
  license: string;
  note?: string;
  files: Record<string, FontEntry>;
}

const sourceDir = process.env.FONTS_SOURCE_DIR ?? join(homedir(), "Library", "Fonts");
const adobeCache = join(homedir(), "Library", "Application Support", "Adobe", "CoreSync", "plugins", "livetype");
const writeManifest = process.argv.includes("--write-manifest");
const FAMILIES = ["gotham", "address-sans"];

const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

/** null si el archivo es la fuente que dice el manifest; si no, el motivo. */
function problemWith(bytes: Buffer, entry: FontEntry): string | null {
  let font: fontkit.Font;
  try {
    font = fontkit.create(bytes) as fontkit.Font;
  } catch {
    return "no se puede leer como fuente";
  }
  if (entry.postscriptName && font.postscriptName !== entry.postscriptName) {
    return `es «${font.postscriptName}», se esperaba «${entry.postscriptName}»`;
  }
  if (entry.advances) {
    const wrong = advanceMismatches(font, entry.advances);
    if (wrong.length > 0) return `los anchos no coinciden con la fuente original (glifos: ${wrong.join(" ")}): no es la misma versión`;
  }
  return null;
}

async function toWoff2(candidate: FontCandidate): Promise<Buffer> {
  const bytes = readFileSync(candidate.path);
  return candidate.isWoff2 ? bytes : Buffer.from(await wawoff2.compress(bytes));
}

let machineFonts: FontCandidate[] | undefined;
const findOnMachine = (postscriptName: string) => {
  machineFonts ??= scanFonts([sourceDir, adobeCache]);
  return machineFonts.filter((candidate) => candidate.postscriptName === postscriptName);
};

let failures = 0;
for (const family of FAMILIES) {
  const targetDir = fileURLToPath(new URL(`../assets/fonts/${family}/`, import.meta.url));
  const manifestPath = join(targetDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as FontManifest;
  mkdirSync(targetDir, { recursive: true });

  for (const [file, entry] of Object.entries(manifest.files)) {
    const target = join(targetDir, file);
    const label = `${family}/${file}`;

    // Ya instalada y correcta (nombre, huella de anchos y, si está fijado, sha256).
    const installedProblem = existsSync(target) ? problemWith(readFileSync(target), entry) : "no instalada";
    if (installedProblem === null && writeManifest) {
      entry.sha256 = sha256(target);
      console.log(`✓ ${label} (sha256 fijado)`);
      continue;
    }
    if (installedProblem === null && (entry.sha256 === "" || sha256(target) === entry.sha256)) {
      console.log(`✓ ${label} (ya instalada${entry.sha256 === "" ? "; sin sha256 fijado: usa --write-manifest" : ""})`);
      continue;
    }

    // Candidatas: el archivo con ese nombre en la carpeta de origen y, por nombre PostScript, el resto de la máquina.
    const direct = join(sourceDir, file);
    const candidates = [
      ...(existsSync(direct) ? [{ path: direct, postscriptName: entry.postscriptName ?? "", isWoff2: true }] : []),
      ...(entry.postscriptName ? findOnMachine(entry.postscriptName) : []),
    ];
    let installed = false;
    const rejected: string[] = [];
    for (const candidate of candidates) {
      const woff2 = await toWoff2(candidate);
      const problem = problemWith(woff2, entry);
      if (problem) {
        rejected.push(`${candidate.path}: ${problem}`);
        continue;
      }
      const hash = createHash("sha256").update(woff2).digest("hex");
      if (entry.sha256 && hash !== entry.sha256 && !writeManifest && candidate.isWoff2) {
        rejected.push(`${candidate.path}: el sha256 no coincide con manifest.json (usa --write-manifest si es otra versión)`);
        continue;
      }
      writeFileSync(target, woff2);
      if (writeManifest) entry.sha256 = hash;
      console.log(`✓ ${label}${candidate.isWoff2 ? "" : " (convertida a .woff2)"} ← ${candidate.path}`);
      installed = true;
      break;
    }
    if (installed) continue;

    failures++;
    if (installedProblem && installedProblem !== "no instalada") console.error(`✕ ${label}: el archivo instalado no sirve: ${installedProblem}`);
    else console.error(`✕ ${label}: no se encontró en ${sourceDir} ni en la caché de Adobe Fonts`);
    for (const reason of rejected) console.error(`    descartada ${reason}`);
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
