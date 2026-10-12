import { afterEach, describe, expect, it, vi } from "vitest";

import { MemoryStorage } from "../../../tests/helpers/memory-storage";
import { ownQrSvg } from "../../../tests/helpers/qr-svg";

const MENU = "https://menu.example.com/tropical";

afterEach(() => {
  vi.doUnmock("sharp");
  vi.resetModules();
});

describe("verifyExistingQr sin sharp (Cloudflare Workers)", () => {
  it("avisa con un error visible, no genera nada y no deja la pieza «verificando»", async () => {
    vi.resetModules();
    vi.doMock("sharp", () => {
      throw new Error('Could not load the "sharp" module');
    });
    const { verifyExistingQr } = await import("./verify-existing");

    const storage = new MemoryStorage();
    const key = `qr/v1/${"a".repeat(64)}.svg`;
    await storage.upload(key, ownQrSvg(MENU), { contentType: "image/svg+xml", ifNoneMatch: true });
    storage.calls.upload = 0;

    const outcome = await verifyExistingQr(`https://cdn.example.com/${key}`, {
      storage,
      fetchRemote: vi.fn(async () => {
        throw new Error("no debe salir a la red");
      }),
      keyPrefix: "",
      now: () => new Date("2026-10-06T12:00:00.000Z"),
    });

    expect(outcome).toMatchObject({ ok: false, error: { code: "unsupported-type" } });
    expect(storage.calls.upload).toBe(0); // regla crítica: nunca se genera ni se guarda un QR
  });
});
