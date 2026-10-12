/**
 * Sube las fuentes de las piezas al bucket R2 privado del Worker (prefijo `fonts/`), de donde las
 * lee el servidor en Cloudflare (no hay disco). Solo se suben las que usa el servidor: Gotham es
 * de la interfaz y va dentro del build (next/font).
 *
 *   bun run cf:fonts              # bucket local simulado (para `wrangler dev`)
 *   bun run cf:fonts -- --remote  # bucket real de tu cuenta de Cloudflare (pide `wrangler login`)
 *
 * `/api/storage/**` solo sirve claves de QR: estas fuentes nunca son públicas.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "qr-production-generator-qr";
const FAMILIES_FOR_SERVER = ["address-sans"];
const remote = process.argv.includes("--remote");

let failures = 0;
for (const family of FAMILIES_FOR_SERVER) {
  const dir = fileURLToPath(new URL(`../assets/fonts/${family}/`, import.meta.url));
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".woff2")) : [];
  if (files.length === 0) {
    console.error(`✕ ${family}: no hay .woff2 en assets/fonts/${family}. Ejecuta \`bun run fonts:setup\` primero.`);
    failures++;
    continue;
  }
  for (const name of files) {
    const key = `${BUCKET}/fonts/${family}/${name}`;
    const result = spawnSync("bunx", ["wrangler", "r2", "object", "put", key, "--file", join(dir, name), "--content-type", "font/woff2", remote ? "--remote" : "--local"], { stdio: "inherit" });
    if (result.status === 0) console.log(`✓ fonts/${family}/${name} → ${remote ? "R2 (real)" : "R2 (local)"}`);
    else {
      console.error(`✕ fonts/${family}/${name}`);
      failures++;
    }
  }
}
process.exit(failures > 0 ? 1 : 0);
