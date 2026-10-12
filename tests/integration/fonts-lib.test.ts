import { describe, expect, it } from "vitest";

import { advanceMismatches, type MeasurableFont } from "../../scripts/fonts-lib.mjs";

/** Fuente falsa: cada carácter mide lo que diga la tabla (en unidades por 1000 em). */
const fakeFont = (advances: Record<string, number>): MeasurableFont => ({
  unitsPerEm: 1000,
  layout: (text) => ({ advanceWidth: advances[text] ?? 0 }),
});

const CD_FINGERPRINT = { M: 613, T: 358, O: 450, A: 415, "0": 450, "1": 286 };

describe("advanceMismatches (huella de la Address Sans Pro Cd)", () => {
  it("acepta la fuente correcta", () => {
    expect(advanceMismatches(fakeFont(CD_FINGERPRINT), CD_FINGERPRINT)).toEqual([]);
  });

  it("tolera ±1 por redondeo entre formatos", () => {
    expect(advanceMismatches(fakeFont({ ...CD_FINGERPRINT, M: 614, T: 357 }), CD_FINGERPRINT)).toEqual([]);
  });

  it("rechaza Address Sans SemiBold de ancho normal y dice qué glifos fallan", () => {
    const semibold = { M: 733, T: 474, O: 568, A: 537, "0": 568, "1": 347 };
    expect(advanceMismatches(fakeFont(semibold), CD_FINGERPRINT).sort()).toEqual(["0", "1", "A", "M", "O", "T"]);
  });

  it("rechaza un solo glifo distinto", () => {
    expect(advanceMismatches(fakeFont({ ...CD_FINGERPRINT, T: 380 }), CD_FINGERPRINT)).toEqual(["T"]);
  });
});
