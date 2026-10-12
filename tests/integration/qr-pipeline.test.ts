import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { acknowledgeQr, applyQrResolution, createRecord, updateRecordData, draftOf } from "@/lib/records/factory";
import { canApplyResolution, isExportable, qrBlocker, resolveQrDecision } from "@/lib/records/qr-state";
import { encodeMatrix } from "@/lib/qr/encode";
import { ExportRecordSchema } from "@/schemas/record";
import { contentHashOf } from "@/server/qr/hash";
import { verifyQrIdentity } from "@/server/qr/identity";
import { materializeQrGeometry } from "@/server/qr/materialize";
import { HourlyQuota } from "@/server/qr/quota";
import { resolveGenerate } from "@/server/qr/resolve";
import { verifyExistingQr } from "@/server/qr/verify-existing";
import { LocalStorageProvider } from "@/server/storage/local";
import type { ExportRecord, QRRecord } from "@/types";

import { draft, LATER, NOW } from "../helpers/records";
import { bytes, ownQrSvg } from "../helpers/qr-svg";

/**
 * Registros → QR → exportación, con el storage local REAL en un directorio
 * temporal. Cubre los criterios AC12–AC17 de principio a fin.
 */
const MENU = "https://menu.example.com/tropical";
const EXISTING_URL = "https://qr.cliente.com/tropical/m1.svg";
let dir: string;
let storage: LocalStorageProvider;
const deps = () => ({ storage, keyPrefix: "", quota: new HourlyQuota(1000), now: () => new Date(NOW) });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "qrpg-int-"));
  storage = new LocalStorageProvider(dir, "http://localhost:3000/api/storage");
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const files = async () => (await readdir(join(dir, "qr", "v1"), { recursive: false }).catch(() => [])).filter((f) => f.endsWith(".svg"));

function toExport(record: QRRecord): ExportRecord {
  return ExportRecordSchema.parse({ id: record.id, area: record.area, estacion: record.estacion, mesa: record.mesa, subgrupo: record.subgrupo, concepto: record.concepto, menuUrl: record.menuUrl, qrUrl: record.qrUrl, qr: record.qr, qrAck: record.qrAck });
}

describe("flujo manual sin Link del QR → se genera una sola vez", () => {
  it("crear → resolver → aplicar → verificar identidad → materializar, y reabrir/re-exportar no genera nada", async () => {
    let record = createRecord(draft(), { now: NOW, order: 0, origin: "manual", id: "r1" });
    expect(resolveQrDecision(record)).toBe("generate");
    expect(isExportable(record)).toBe(false); // «QR pendiente»

    const { results, created } = await resolveGenerate([{ recordId: record.id, menuUrl: record.menuUrl, expectedRevision: 0 }], deps());
    expect(created).toBe(1);
    const result = results[0]!;
    expect(canApplyResolution(record, { menuUrl: record.menuUrl }, result)).toBe(true);
    record = applyQrResolution(record, result, LATER);
    expect(record).toMatchObject({ qrStatus: "generated", qr: { source: "generated" } });
    expect(isExportable(record)).toBe(true);
    expect(await files()).toEqual([`${contentHashOf(MENU)}.svg`]);

    // Exportación: identidad + materialización sin escribir nada.
    const exported = toExport(record);
    verifyQrIdentity(exported, { storage, keyPrefix: "" });
    const spy = vi.spyOn(storage, "upload");
    const geometry = await materializeQrGeometry(exported, { storage });
    expect(geometry).toMatchObject({ kind: "matrix" });
    expect(geometry.kind === "matrix" && geometry.matrix).toEqual(encodeMatrix(MENU));
    expect(spy).not.toHaveBeenCalled();

    // «Reabrir la app»: el registro ya tiene QR → la decisión es reutilizar y no se vuelve a pedir nada.
    expect(resolveQrDecision(record)).toBe("reuse-generated");
    expect(await files()).toHaveLength(1);
    spy.mockRestore();
  });

  it("editar el Link del menú deja el QR 'stale' y bloquea hasta decidir; mantener lo desbloquea y no crea archivos", async () => {
    const { results } = await resolveGenerate([{ recordId: "r2", menuUrl: MENU, expectedRevision: 0 }], deps());
    let record = applyQrResolution(createRecord(draft(), { now: NOW, order: 0, origin: "manual", id: "r2" }), results[0]!, NOW);
    const filesBefore = await files();

    record = updateRecordData(record, { ...draftOf(record), menuUrl: "https://menu.example.com/nuevo" }, LATER);
    expect(record.qrStatus).toBe("stale");
    expect(qrBlocker(record)).toBe("stale");
    expect(() => toExport(record)).toThrow(); // el servidor tampoco lo aceptaría

    record = acknowledgeQr(record, "stale", LATER);
    expect(isExportable(record)).toBe(true);
    expect(() => toExport(record)).not.toThrow();
    expect(await files()).toEqual(filesBefore);
  });
});

describe("flujo con Link del QR → se usa ese recurso, jamás se genera (AC12)", () => {
  it("crear con qrUrl → verificar → materializar la instantánea: 0 QR generados", async () => {
    const before = await files();
    let record = createRecord(draft({ qrUrl: EXISTING_URL }), { now: NOW, order: 1, origin: "excel", sourceRow: 5, id: "r3" });
    expect(record.qr.source).toBe("existing");
    expect(resolveQrDecision(record)).toBe("check-existing"); // nunca "generate"

    // Si alguien intentara generar para este registro, el servidor lo rechaza.
    const attempt = await resolveGenerate([{ recordId: record.id, menuUrl: record.menuUrl, expectedRevision: 0, qrUrl: record.qrUrl }], deps());
    expect(attempt.results[0]).toMatchObject({ outcome: "failed", error: { code: "unsafe-url" } });

    const verified = await verifyExistingQr(EXISTING_URL, {
      storage,
      keyPrefix: "",
      now: () => new Date(NOW),
      fetchRemote: async (url) => ({ bytes: bytes(ownQrSvg(MENU)), contentType: "image/svg+xml", finalUrl: url }),
    });
    if (!verified.ok) throw new Error(verified.error.message);
    record = applyQrResolution(record, { recordId: record.id, outcome: "existing-ok", qr: verified.qr }, LATER);
    expect(isExportable(record)).toBe(true);
    expect(record.qrUrl).toBe(EXISTING_URL); // exactamente el recurso aportado

    const exported = toExport(record);
    verifyQrIdentity(exported, { storage, keyPrefix: "" });
    expect(await materializeQrGeometry(exported, { storage })).toMatchObject({ kind: "external" });
    expect(await files()).toEqual(before); // ningún QR nuevo en qr/v1
  });
});
