import { describe, expect, it } from "vitest";

import { detectHeaderRow } from "@/services/qr-produccion/excel/headers";
import type { RawCell } from "@/services/qr-produccion/excel/types";

import { MemoryLinksTable } from "../test-helpers/memory-links";
import { DbShortLinkRepository } from "./db-repository";
import { buildUpdatedRows, ORIGINAL_LINK_HEADER } from "./excel-rows";
import { shortenUrls } from "./service";

const BASE = "https://qr.example.com";
const LONG = `https://menu.palaceresorts.com/carta?id=${"x".repeat(150)}`;

async function setup() {
  const repo = new DbShortLinkRepository(new MemoryLinksTable());
  const deps = { repo, base: BASE, ownHosts: ["qr.example.com"], now: () => "2026-10-14T12:00:00.000Z" };
  const [made] = await shortenUrls([LONG], deps);
  return { deps, short: made?.shortUrl ?? "" };
}
const rec = (menuUrl: string, mesa = "1", qrUrl?: string) => ({ area: "A", estacion: "", mesa, subgrupo: "", concepto: "", menuUrl, ...(qrUrl === undefined ? {} : { qrUrl }) });

describe("Excel actualizado (filas)", () => {
  it("trae los encabezados que reconoce la importación y el link corto en «Link del menú»", async () => {
    const { deps, short } = await setup();
    const { header, rows } = await buildUpdatedRows([{ ...rec(short, "B1"), area: "Playa", concepto: "Alimentos" }], deps);
    expect(header).toEqual(["Área", "Estación", "Mesa", "Sub-grupo", "Concepto", "Link del menú", "Link del QR", ORIGINAL_LINK_HEADER]);
    expect(rows[0]?.[5]).toBe(short);
  });

  it("la importación detecta las columnas del archivo actualizado y la de referencia no se toma por el link del menú", async () => {
    const { deps, short } = await setup();
    const { header, rows } = await buildUpdatedRows([rec(short)], deps);
    const raw: Array<Array<RawCell | null>> = [header, ...rows].map((row) => row.map((v) => (v === "" ? null : { t: "s", v, w: v })));
    const detected = detectHeaderRow(raw);
    expect(detected).not.toBeNull();
    const mapped = (detected?.mapping ?? []).filter((m) => m.field === "menuUrl");
    expect(mapped).toHaveLength(1);
  });

  it("la columna de referencia lleva el destino vigente de cada link corto, también si se cambió después", async () => {
    const { deps, short } = await setup();
    const code = short.split("/s/")[1] ?? "";
    await deps.repo.updateDestination(code, "https://nuevo.example.com/menu", "2026-10-14T13:00:00.000Z");
    const { rows } = await buildUpdatedRows([rec(short), rec("https://otro.example.com/sin-acortar", "2")], deps);
    expect(rows[0]?.[7]).toBe("https://nuevo.example.com/menu");
    expect(rows[1]?.[7]).toBe(""); // un link que no es nuestro no tiene referencia
  });

  it("«Link del QR» solo se escribe cuando la persona lo aportó", async () => {
    const { deps, short } = await setup();
    const { rows } = await buildUpdatedRows([rec(short, "1", "https://cdn.example.com/mi-qr.svg"), rec(short, "2")], deps);
    expect(rows[0]?.[6]).toBe("https://cdn.example.com/mi-qr.svg");
    expect(rows[1]?.[6]).toBe("");
  });

  it("un link corto de otro dominio no se consulta (no es nuestro)", async () => {
    const { deps, short } = await setup();
    const { rows } = await buildUpdatedRows([rec(short.replace("qr.example.com", "ajeno.example.org"))], deps);
    expect(rows[0]?.[7]).toBe("");
  });
});
