import { describe, expect, it } from "vitest";

import { acknowledgeQr } from "@/lib/records/factory";
import { addRecord, applyResolutions, createEmptyProject, setProjectName } from "@/lib/state/project";
import { ExportRequestSchema } from "@/schemas/export";
import type { QrResolution } from "@/types";

import { draft, generatedSource, LATER, MENU, NOW } from "../../../tests/helpers/records";
import { blockerOf, buildExportRequest, projectRecord, resolveFileName } from "./build-request";

const generatedResolution = (id: string, menuUrl: string): QrResolution => ({ recordId: id, outcome: "generated", qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource(menuUrl) });

function project(count: number, resolved = true) {
  let p = setProjectName(createEmptyProject(NOW, { id: "p" }), "T");
  const sent = new Map<string, { menuUrl: string }>();
  const results: QrResolution[] = [];
  for (let i = 1; i <= count; i++) {
    const menuUrl = `${MENU}?m=${i}`;
    p = addRecord(p, draft({ mesa: `M${i}`, menuUrl }), NOW, { id: `r${i}` }).state;
    sent.set(`r${i}`, { menuUrl });
    results.push(generatedResolution(`r${i}`, menuUrl));
  }
  return resolved ? applyResolutions(p, results, sent, LATER).state : p;
}

describe("buildExportRequest", () => {
  it("proyecta solo lo necesario y el servidor lo acepta (ExportRequestSchema)", () => {
    const built = buildExportRequest(project(3), [], new Date(2026, 9, 8, 14, 5));
    expect(built.blocked).toEqual([]);
    expect(built.request.options.fileName).toBe("qr-production-2026-10-08-1405");
    expect(Object.keys(built.request.records[0] ?? {}).sort()).toEqual(["area", "concepto", "estacion", "id", "menuUrl", "mesa", "qr", "qrUrl", "subgrupo"]);
    expect(ExportRequestSchema.safeParse(built.request).success).toBe(true);
  });

  it("las excluidas no viajan y el resto conserva el orden", () => {
    const built = buildExportRequest(project(4), ["r2"], new Date());
    expect(built.request.records.map((r) => r.id)).toEqual(["r1", "r3", "r4"]);
    expect(built.excluded).toBe(1);
  });

  it("lista las piezas que bloquean con su motivo, y una excluida deja de bloquear", () => {
    const base = project(2);
    const withPending = addRecord(base, draft({ mesa: "M3", menuUrl: `${MENU}?m=3` }), NOW, { id: "r3" }).state;
    const built = buildExportRequest(withPending, [], new Date());
    expect(built.blocked).toEqual([{ recordId: "r3", reason: "Falta generar el QR" }]);
    expect(buildExportRequest(withPending, ["r3"], new Date()).blocked).toEqual([]);
  });

  it("motivos: desactualizado, con errores y confirmado (el ack lo desbloquea)", () => {
    const base = project(1);
    const record = base.recordsById["r1"];
    if (!record) throw new Error("falta r1");
    const stale = { ...record, menuUrl: "https://menu.example.com/otro" };
    expect(blockerOf(stale)?.reason).toMatch(/desactualizado/);
    expect(blockerOf(acknowledgeQr(stale, "stale", LATER))).toBeNull();
    expect(blockerOf({ ...record, validationErrors: [{ field: "mesa", code: "REQUIRED_EMPTY", message: "La mesa es obligatoria", severity: "error" }] })?.reason).toBe("La mesa es obligatoria");
  });

  it("el nombre: el escrito (saneado) o el de fecha y hora locales", () => {
    const p = project(1);
    expect(resolveFileName(p, new Date(2026, 0, 2, 3, 4))).toBe("qr-production-2026-01-02-0304");
    expect(resolveFileName({ ...p, fileNameTouched: true, exportOptions: { ...p.exportOptions, fileName: "Mesas/LBLC: 2026" } }, new Date())).toBe("Mesas_LBLC_ 2026");
    expect(resolveFileName({ ...p, fileNameTouched: true, exportOptions: { ...p.exportOptions, fileName: "   " } }, new Date(2026, 0, 2, 3, 4))).toBe("qr-production-2026-01-02-0304");
    expect(projectRecord(p.recordsById["r1"]!).qrUrl).toContain("https://cdn.example.com");
  });
});
