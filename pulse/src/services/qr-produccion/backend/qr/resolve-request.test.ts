import { describe, expect, it, vi } from "vitest";

import { ownQrSvg, bytes } from "../test-helpers/qr-svg";
import { MemoryStorage } from "../test-helpers/memory-storage";
import { hostPolicyFrom, qrHostMatcher } from "./host-policy";
import { HourlyQuota } from "./quota";
import { runQrResolve, type QrResolveServices } from "./resolve-request";

const MENU = "https://menu.example.com/tropical";

function services(overrides: Partial<QrResolveServices> = {}) {
  const storage = new MemoryStorage();
  const fetchRemote = vi.fn(async (url: string) => ({ bytes: bytes(ownQrSvg(MENU)), contentType: "image/svg+xml", finalUrl: url }));
  const value: QrResolveServices = {
    resolve: { storage, keyPrefix: "", quota: new HourlyQuota(100), now: () => new Date() },
    verify: { storage, keyPrefix: "", now: () => new Date(), fetchRemote },
    maxBatch: 100,
    ...overrides,
  };
  return { value, storage, fetchRemote };
}

describe("runQrResolve — la regla crítica", () => {
  it("un registro con Link del QR se verifica y NUNCA genera un QR (no sube ningún qr/v1/*.svg)", async () => {
    const { value, storage, fetchRemote } = services();
    const response = await runQrResolve({ verify: [{ recordId: "r1", qrUrl: "https://qr.cliente.com/m1.svg", menuUrl: MENU }] }, value);
    expect(response).toMatchObject({ created: 0, reused: 0, failed: 0, results: [{ recordId: "r1", outcome: "existing-ok" }] });
    expect(fetchRemote).toHaveBeenCalledOnce();
    expect([...storage.objects.keys()].some((key) => key.startsWith("qr/v1/"))).toBe(false);
  });

  it("un ítem de generación que trae qrUrl o qr se rechaza en el servidor aunque el cliente lo pida", async () => {
    const { value, storage } = services();
    const response = await runQrResolve({ items: [{ recordId: "r1", menuUrl: MENU, expectedRevision: 0, qrUrl: "https://qr.cliente.com/m1.svg" }, { recordId: "r2", menuUrl: MENU, expectedRevision: 0, qr: { source: "existing" } }] }, value);
    expect(response.failed).toBe(2);
    expect(response.results.every((r) => r.outcome === "failed")).toBe(true);
    expect(storage.calls.upload).toBe(0);
  });

  it("sin Link del QR genera una vez y reutiliza", async () => {
    const { value } = services();
    const item = { recordId: "r1", menuUrl: MENU, expectedRevision: 0 };
    expect(await runQrResolve({ items: [item] }, value)).toMatchObject({ created: 1, reused: 0 });
    expect(await runQrResolve({ items: [item] }, value)).toMatchObject({ created: 0, reused: 1 });
  });

  it("valida la petición (400 con detalle) y el tamaño del lote", async () => {
    const { value } = services({ maxBatch: 2 });
    await expect(runQrResolve({}, value)).rejects.toMatchObject({ status: 400, code: "VALIDATION_FAILED" });
    await expect(runQrResolve({ items: Array.from({ length: 3 }, (_, i) => ({ recordId: `r${i}`, menuUrl: MENU, expectedRevision: 0 })) }, value)).rejects.toMatchObject({ status: 400, message: "Máximo 2 registros por llamada" });
    await expect(runQrResolve({ verify: [{ recordId: "r", qrUrl: 1 }] }, value)).rejects.toMatchObject({ details: expect.any(Array) });
  });
});

describe("política de hosts", () => {
  it("pública no filtra; la lista blanca añade nuestro propio origen y admite subdominios con punto", () => {
    expect(hostPolicyFrom({ mode: "public", allowedHosts: ["a.com"] })).toEqual({ mode: "public" });
    const policy = hostPolicyFrom({ mode: "allowlist", allowedHosts: ["qr.cliente.com", ".cdn.cliente.com"], ownHost: "x.supabase.co" });
    expect(policy).toEqual({ mode: "allowlist", hosts: ["qr.cliente.com", ".cdn.cliente.com", "x.supabase.co"] });
    const matches = qrHostMatcher(policy);
    expect(matches?.("img.cdn.cliente.com")).toBe(true);
    expect(matches?.("evilcdn.cliente.com")).toBe(false);
    expect(qrHostMatcher({ mode: "public" })).toBeUndefined();
  });
});
