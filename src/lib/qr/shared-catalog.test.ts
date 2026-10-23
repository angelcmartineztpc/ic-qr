import { describe, expect, it } from "vitest";

import { createRecord } from "@/lib/records/factory";
import { canonicalAssetKey, inspectRecordQrAsset, summarizeQrCatalog } from "./shared-catalog";

describe("shared-catalog (escalabilidad de QR multi-proyecto)", () => {
  it("deduplica activos QR por código corto (/s/código) o por payload canónico entre piezas", () => {
    const now = "2026-04-19T12:00:00.000Z";
    const r1 = createRecord(
      { area: "Terraza", estacion: "Barra", mesa: "1", subgrupo: "", concepto: "", menuUrl: "https://qr.example.com/s/AbCdEfGh" },
      { now, order: 0, origin: "manual", id: "r1" },
    );
    const r2 = createRecord(
      { area: "Salón", estacion: "Central", mesa: "2", subgrupo: "", concepto: "", menuUrl: "https://qr.example.com/s/AbCdEfGh" },
      { now, order: 1, origin: "manual", id: "r2" },
    );
    const r3 = createRecord(
      { area: "VIP", estacion: "Norte", mesa: "3", subgrupo: "", concepto: "", menuUrl: "", qrUrl: "https://cdn.example.com/qr-vip.svg" },
      { now, order: 2, origin: "excel", id: "r3" },
    );

    expect(canonicalAssetKey(r1)).toBe("short:abcdefgh");
    expect(canonicalAssetKey(r2)).toBe("short:abcdefgh");
    expect(canonicalAssetKey(r3)).toBe("ext:https://cdn.example.com/qr-vip.svg");

    const summary = summarizeQrCatalog([r1, r2, r3]);
    expect(summary.uniqueAssets).toBe(2);
    expect(summary.reusedInstances).toBe(1);
    expect(summary.shortCodeCount).toBe(1);
    expect(summary.externalCount).toBe(1);

    const info1 = inspectRecordQrAsset(r1, summary);
    expect(info1.shortCode).toBe("abcdefgh");
    expect(info1.sharedCount).toBe(2);
    expect(info1.isSharedInBatch).toBe(true);

    const info3 = inspectRecordQrAsset(r3, summary);
    expect(info3.shortCode).toBeNull();
    expect(info3.sharedCount).toBe(1);
    expect(info3.isSharedInBatch).toBe(false);
  });
});

