import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { detectHeaderRow } from "@/lib/excel/headers";
import type { RawCell } from "@/lib/excel/types";

import { MemoryStorage } from "../../../tests/helpers/memory-storage";
import { buildUpdatedWorkbook, EXCEL_SHEET_NAME, ORIGINAL_LINK_HEADER } from "./excel";
import { ObjectShortLinkRepository } from "./object-repository";
import { shortenUrls } from "./service";

const BASE = "https://qr.example.com";
const LONG = `https://menu.palaceresorts.com/carta?id=${"x".repeat(150)}`;

async function setup() {
  const repo = new ObjectShortLinkRepository(new MemoryStorage());
  const deps = { repo, base: BASE, ownHosts: ["qr.example.com"], now: () => "2026-10-14T12:00:00.000Z" };
  const [made] = await shortenUrls([LONG], deps);
  return { deps, short: made?.shortUrl ?? "" };
}
const read = (bytes: Uint8Array) => {
  const book = XLSX.read(bytes, { type: "array" });
  return XLSX.utils.sheet_to_json<string[]>(book.Sheets[EXCEL_SHEET_NAME] as XLSX.WorkSheet, { header: 1, defval: "" });
};

describe("Excel actualizado", () => {
  it("trae los encabezados que reconoce la importación y el link corto en «Link del menú»", async () => {
    const { deps, short } = await setup();
    const rows = read(await buildUpdatedWorkbook([{ area: "Playa", estacion: "", mesa: "B1", subgrupo: "", concepto: "Alimentos", menuUrl: short }], deps));
    expect(rows[0]).toEqual(["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú", "Link del QR", ORIGINAL_LINK_HEADER]);
    expect(rows[1]?.[5]).toBe(short);
  });

  it("la importación detecta las columnas del archivo actualizado y la de referencia no se toma por el link del menú", async () => {
    const { deps, short } = await setup();
    const rows = read(await buildUpdatedWorkbook([{ area: "Playa", estacion: "", mesa: "B1", subgrupo: "", concepto: "", menuUrl: short }], deps));
    const raw: Array<Array<RawCell | null>> = rows.map((row) => row.map((v) => (v === "" ? null : { t: "s", v, w: v })));
    const detected = detectHeaderRow(raw);
    expect(detected).not.toBeNull();
    const mapped = Object.entries(detected?.mapping ?? {}).flatMap(([column, field]) => (field ? [[column, typeof field === "string" ? field : (field as { field?: string }).field] as const] : []));
    const menuColumns = mapped.filter(([, field]) => field === "menuUrl");
    expect(menuColumns).toHaveLength(1);
  });

  it("la columna de referencia lleva el destino vigente de cada link corto, también si se cambió después", async () => {
    const { deps, short } = await setup();
    const code = short.split("/s/")[1] ?? "";
    await deps.repo.updateDestination(code, "https://nuevo.example.com/menu", "2026-10-14T13:00:00.000Z");
    const rows = read(await buildUpdatedWorkbook([{ area: "A", estacion: "", mesa: "1", subgrupo: "", concepto: "", menuUrl: short }, { area: "A", estacion: "", mesa: "2", subgrupo: "", concepto: "", menuUrl: "https://otro.example.com/sin-acortar" }], deps));
    expect(rows[1]?.[7]).toBe("https://nuevo.example.com/menu");
    expect(rows[2]?.[7]).toBe(""); // un link que no es nuestro no tiene referencia
  });

  it("«Link del QR» solo se escribe cuando la persona lo aportó", async () => {
    const { deps, short } = await setup();
    const rows = read(await buildUpdatedWorkbook([{ area: "A", estacion: "", mesa: "1", subgrupo: "", concepto: "", menuUrl: short, qrUrl: "https://cdn.example.com/mi-qr.svg" }, { area: "A", estacion: "", mesa: "2", subgrupo: "", concepto: "", menuUrl: short }], deps));
    expect(rows[1]?.[6]).toBe("https://cdn.example.com/mi-qr.svg");
    expect(rows[2]?.[6]).toBe("");
  });

  it("un link corto de otro dominio no se consulta (no es nuestro)", async () => {
    const { deps, short } = await setup();
    const foreign = short.replace("qr.example.com", "ajeno.example.org");
    const rows = read(await buildUpdatedWorkbook([{ area: "A", estacion: "", mesa: "1", subgrupo: "", concepto: "", menuUrl: foreign }], deps));
    expect(rows[1]?.[7]).toBe("");
  });
});
