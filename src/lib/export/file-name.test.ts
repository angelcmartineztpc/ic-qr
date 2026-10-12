import { describe, expect, it } from "vitest";

import { FileNameSchema } from "@/schemas/export";

import { defaultFileName, sanitizeFileName, zipEntryName } from "./file-name";

describe("nombre del archivo (spec §20)", () => {
  it("usa el nombre del usuario: Tropical_Mesas_2026 → Tropical_Mesas_2026(.pdf)", () => {
    expect(FileNameSchema.parse("Tropical_Mesas_2026")).toBe("Tropical_Mesas_2026");
    expect(FileNameSchema.parse("Tropical_Mesas_2026.PDF")).toBe("Tropical_Mesas_2026");
  });

  it("nombre por defecto qr-production-YYYY-MM-DD-HHmm en hora local", () => {
    expect(defaultFileName(new Date(2026, 9, 6, 9, 5))).toBe("qr-production-2026-10-06-0905");
    expect(defaultFileName(new Date(2026, 0, 1, 23, 59))).toBe("qr-production-2026-01-01-2359");
  });

  it("sanea caracteres peligrosos, puntos finales y nombres reservados de Windows", () => {
    expect(sanitizeFileName("Tropical/Mesas:2026.pdf")).toBe("Tropical_Mesas_2026");
    expect(sanitizeFileName('a\tb<c>"d"|e?.pdf')).toBe("a b_c__d__e_");
    expect(sanitizeFileName("..secreto..")).toBe("secreto");
    expect(sanitizeFileName("CON")).toBe("CON_");
    expect(sanitizeFileName("Menú – Terraza")).toBe("Menú – Terraza");
    expect(sanitizeFileName("x".repeat(300))).toHaveLength(120);
  });

  it("rechaza un nombre que queda vacío", () => {
    expect(FileNameSchema.safeParse("  ...  ").success).toBe(false);
  });
});

describe("zipEntryName (spec §48)", () => {
  it("001.svg, 002.svg… y variante con área y mesa", () => {
    expect(zipEntryName(0, 248)).toBe("001.svg");
    expect(zipEntryName(247, 248)).toBe("248.svg");
    expect(zipEntryName(0, 1500)).toBe("0001.svg");
    expect(zipEntryName(0, 10, "Tropical M1")).toBe("001-tropical-m1.svg");
    expect(zipEntryName(1, 10, "Área Ñandú · M2")).toBe("002-area-nandu-m2.svg");
  });
});
