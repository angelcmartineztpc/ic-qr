import { describe, expect, it } from "vitest";

import { comparableText, normalizeText } from "./normalize";

describe("normalizeText", () => {
  it("compone a NFC (á en dos code points → uno)", () => {
    const decomposed = "México"; // e + acento combinante
    expect(normalizeText(decomposed)).toBe("México");
    expect(normalizeText(decomposed).length).toBe(6);
  });

  it("elimina bidi override, zero-width y BOM, pero conserva ZWJ", () => {
    expect(normalizeText("M1‮evil")).toBe("M1evil");
    expect(normalizeText("TRO​PICAL")).toBe("TROPICAL");
    expect(normalizeText("﻿Mesa")).toBe("Mesa");
    expect(normalizeText("👩‍🍳")).toBe("👩‍🍳");
  });

  it("convierte controles en espacio y colapsa espacios", () => {
    expect(normalizeText("  Terraza\t\n 4  ")).toBe("Terraza 4");
    expect(normalizeText("A\u0000B")).toBe("A B");
  });

  it("conserva el texto libre tal cual (campos abiertos)", () => {
    expect(normalizeText("VIP-A · Terraza #4 (exterior)")).toBe("VIP-A · Terraza #4 (exterior)");
  });
});

describe("comparableText", () => {
  it("ignora mayúsculas y normaliza", () => {
    expect(comparableText(" Tropical ")).toBe(comparableText("TROPICAL"));
    expect(comparableText("ÁREA")).toBe("área");
  });
});
