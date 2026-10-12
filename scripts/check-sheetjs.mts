/**
 * SheetJS se instala desde su CDN (la versión de npm tiene CVE sin corregir) y
 * Dependabot no vigila dependencias por URL. Este script compara la versión
 * fijada en package.json con la última publicada en cdn.sheetjs.com.
 */
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};
const pinned = /xlsx-(\d+\.\d+\.\d+)\.tgz$/.exec(pkg.dependencies.xlsx ?? "")?.[1];
if (!pinned) {
  console.error("No se encontró la URL de SheetJS en package.json");
  process.exit(1);
}

const response = await fetch("https://cdn.sheetjs.com/xlsx.lst");
if (!response.ok) {
  console.error(`No se pudo consultar cdn.sheetjs.com (${response.status})`);
  process.exit(1);
}
const versions = (await response.text())
  .split(/\s+/)
  .map((line) => /xlsx-(\d+\.\d+\.\d+)\.tgz$/.exec(line)?.[1] ?? /^(\d+\.\d+\.\d+)$/.exec(line)?.[1])
  .filter((v): v is string => v !== undefined);

const compare = (a: string, b: string) => {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
const latest = versions.sort(compare).at(-1);

if (!latest) {
  console.error("No se pudo interpretar la lista de versiones de SheetJS");
  process.exit(1);
} else if (compare(latest, pinned) > 0) {
  console.warn(`SheetJS ${latest} disponible (fijada: ${pinned}). Revisa el changelog y actualiza la URL en package.json.`);
  process.exit(2);
} else {
  console.log(`SheetJS al día (${pinned}).`);
}
