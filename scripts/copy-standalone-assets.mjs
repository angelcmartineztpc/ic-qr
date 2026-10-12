// Tras `next build` con output: "standalone", server.js no incluye .next/static ni public/.
// Este paso los copia para que `bun run start` / `npm start` sirvan el build igual que Docker.
import { cpSync, existsSync } from "node:fs";

const standalone = ".next/standalone";
if (!existsSync(standalone)) {
  console.error("No existe .next/standalone: ejecuta primero `next build`.");
  process.exit(1);
}
cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${standalone}/public`, { recursive: true });
if (existsSync("assets/fonts")) cpSync("assets/fonts", `${standalone}/assets/fonts`, { recursive: true });
console.log("Assets copiados a .next/standalone");
