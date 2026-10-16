import { describe, expect, it } from "vitest";

import { sha256Hex } from "./sha256";

describe("sha256Hex", () => {
  it("coincide con los vectores de referencia de FIPS 180-4", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("acepta bytes y cruza el límite de bloque de 64 bytes (55, 56, 63, 64 y 65)", () => {
    // Referencias calculadas con `printf 'a%.0s' {1..N} | shasum -a 256`.
    expect(sha256Hex("a".repeat(55))).toBe("9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318");
    expect(sha256Hex("a".repeat(56))).toBe("b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a");
    expect(sha256Hex("a".repeat(64))).toBe("ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb");
    expect(sha256Hex(new TextEncoder().encode("a".repeat(65)))).toBe(sha256Hex("a".repeat(65)));
  });

  it("maneja UTF-8 multibyte", () => {
    expect(sha256Hex("menú")).toBe(sha256Hex(new TextEncoder().encode("menú")));
  });
});
