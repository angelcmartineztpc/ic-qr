import { describe, expect, it } from "vitest";

import { hashInput, qrStorageKey } from "@/lib/qr/hash-input";
import { QR_RENDERER_VERSION } from "@/lib/qr/version";

import { contentHashOf } from "./hash";

const URL_SHORT = "https://menu.example.com/tropical";

describe("clave de contenido (spec §9–10: no duplicar QR)", () => {
  it("el mismo link siempre da el mismo archivo; otro link, otro archivo", () => {
    expect(contentHashOf(URL_SHORT)).toBe(contentHashOf(URL_SHORT));
    expect(contentHashOf(URL_SHORT)).not.toBe(contentHashOf(`${URL_SHORT}/`));
    expect(contentHashOf(URL_SHORT)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("la entrada del hash incluye payload, corrección, margen, colores y versión del renderer", () => {
    expect(JSON.parse(hashInput(URL_SHORT))).toEqual({
      v: 1,
      payload: URL_SHORT,
      ecc: "high",
      margin: 4,
      dark: "#000000",
      light: "#FFFFFF",
      renderer: QR_RENDERER_VERSION,
    });
  });

  it("clave del storage: [prefijo/]qr/v1/{sha256}.svg", () => {
    const hash = contentHashOf(URL_SHORT);
    expect(qrStorageKey(hash)).toBe(`qr/v1/${hash}.svg`);
    expect(qrStorageKey(hash, "prod")).toBe(`prod/qr/v1/${hash}.svg`);
    expect(qrStorageKey(hash, "prod/")).toBe(`prod/qr/v1/${hash}.svg`);
  });
});
