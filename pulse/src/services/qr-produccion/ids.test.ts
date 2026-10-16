import { afterEach, describe, expect, it, vi } from "vitest";

import { newRecordId, UUID_RE, uuidV4FromBytes } from "./ids";

describe("newRecordId", () => {
  afterEach(() => vi.restoreAllMocks());

  it("genera UUID v4 únicos", () => {
    const ids = new Set(Array.from({ length: 200 }, newRecordId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(UUID_RE);
  });

  it("usa getRandomValues si randomUUID no está disponible (contexto no seguro)", () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(() => {
      throw new Error("insecure context");
    });
    expect(newRecordId()).toMatch(UUID_RE);
  });

  it("fija versión y variante", () => {
    expect(uuidV4FromBytes(new Uint8Array(16).fill(0xff))).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
});
