import { describe, expect, it } from "vitest";

import { acknowledgeQr } from "@/lib/records/factory";
import { PROJECT_FILE_MAX_BYTES } from "@/schemas/project";
import type { QRRecord } from "@/types";

import { draft, generatedSource, LATER, MENU, NOW } from "../../../tests/helpers/records";
import { addRecord, applyResolutions, createEmptyProject, setProjectName, updateRecord } from "./project";
import { buildProjectFile, parseProjectFile, projectFileName, serializeProjectFile } from "./project-file";

function sampleProject() {
  let s = createEmptyProject(NOW, { id: "p1" });
  s = setProjectName(s, "Tropical Mesas 2026");
  s = addRecord(s, draft({ mesa: "M1" }), NOW, { id: "a" }).state;
  s = addRecord(s, draft({ mesa: "M2", qrUrl: "https://qr.cliente.com/m2.svg" }), NOW, { id: "b" }).state;
  s = applyResolutions(s, [{ recordId: "a", outcome: "generated", qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource() }], new Map([["a", { menuUrl: MENU }]]), NOW).state;
  return s;
}

describe("guardar y abrir un proyecto (.qrproj.json)", () => {
  it("ida y vuelta: todo se conserva y reabrir NO regenera ningún QR", () => {
    const original = sampleProject();
    const opened = parseProjectFile(serializeProjectFile(original, LATER), LATER);
    if (!opened.ok) throw new Error(opened.message);
    const { project, summary } = opened;
    expect(summary).toEqual({ records: 2, quarantined: 0, acksCleared: 0 });
    expect(project.order).toEqual(["a", "b"]);
    expect(project.recordsById["a"]).toMatchObject({ qrStatus: "generated", qr: original.recordsById["a"]?.qr, qrUrl: original.recordsById["a"]?.qrUrl });
    expect(project.recordsById["b"]).toMatchObject({ qrStatus: "existing", qrUrl: "https://qr.cliente.com/m2.svg" });
    expect(project.name).toBe("Tropical Mesas 2026");
    expect(project.revision).toBe(0); // recién abierto: sin cambios
  });

  it("materializa el orden en cada registro del archivo", () => {
    const file = buildProjectFile(sampleProject(), LATER);
    expect((Object.values(file.project.recordsById) as QRRecord[]).map((r) => [r.id, r.order])).toEqual([["a", 0], ["b", 1]]);
    expect(file).toMatchObject({ format: "qr-production-project", schemaVersion: 2, exportedAt: LATER });
  });

  it("al abrir se BORRAN todos los acks y se informa de cuántas piezas deben volver a confirmarse", () => {
    let s = sampleProject();
    s = updateRecord(s, "a", draft({ mesa: "M1", menuUrl: "https://menu.example.com/nuevo" }), LATER);
    const a = s.recordsById["a"];
    if (!a) throw new Error("falta a");
    s = { ...s, recordsById: { ...s.recordsById, a: acknowledgeQr(a, "stale", LATER) } };
    expect(s.recordsById["a"]?.qrAck).toBeDefined();

    const opened = parseProjectFile(serializeProjectFile(s, LATER), LATER);
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.summary.acksCleared).toBe(1);
    expect(opened.project.recordsById["a"]?.qrAck).toBeUndefined();
    expect(opened.project.recordsById["a"]?.qrStatus).toBe("stale"); // vuelve a bloquear hasta confirmar
    expect(opened.project.revision).toBeGreaterThan(opened.project.savedRevision); // hay algo que guardar
  });

  it("un registro ilegible va a cuarentena sin perder el resto", () => {
    const file = JSON.parse(serializeProjectFile(sampleProject(), LATER)) as { project: { recordsById: Record<string, unknown> } };
    file.project.recordsById["b"] = { id: "b", area: 7 };
    const opened = parseProjectFile(JSON.stringify(file), LATER);
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.summary).toMatchObject({ records: 1, quarantined: 1 });
    expect(opened.project.quarantine[0]?.raw).toEqual({ id: "b", area: 7 });
  });

  it("un registro que incumple una regla de negocio se abre visible y marcado", () => {
    const file = JSON.parse(serializeProjectFile(sampleProject(), LATER)) as { project: { recordsById: Record<string, { menuUrl: string }> } };
    const record = file.project.recordsById["a"];
    if (!record) throw new Error("falta a");
    record.menuUrl = "hola";
    const opened = parseProjectFile(JSON.stringify(file), LATER);
    if (!opened.ok) throw new Error(opened.message);
    expect(opened.project.recordsById["a"]?.validationErrors.some((e) => e.code === "INVALID_URL")).toBe(true);
  });

  it.each([
    ["no es JSON", "esto no es json", /no es JSON/],
    ["otro formato", JSON.stringify({ format: "otra-cosa", schemaVersion: 2 }), /no es un proyecto/],
    ["versión más reciente", JSON.stringify({ format: "qr-production-project", schemaVersion: 99 }), /versión más reciente/],
    ["vacío", "{}", /no es un proyecto/],
  ])("rechaza %s con un mensaje claro", (_name, text, message) => {
    const result = parseProjectFile(text, LATER);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(message);
  });

  it("rechaza una plantilla desconocida", () => {
    const file = JSON.parse(serializeProjectFile(sampleProject(), LATER)) as { project: { templateId: string; layout: { templateId: string } } };
    file.project.templateId = "fantasma";
    file.project.layout.templateId = "fantasma";
    const result = parseProjectFile(JSON.stringify(file), LATER);
    expect(!result.ok && result.message).toMatch(/plantilla desconocida/);
  });

  it("rechaza archivos de más de 20 MB", () => {
    const result = parseProjectFile(" ".repeat(PROJECT_FILE_MAX_BYTES + 1), LATER);
    expect(!result.ok && result.message).toMatch(/20 MB/);
  });

  it("nombre del archivo a partir del nombre del proyecto", () => {
    expect(projectFileName({ name: "Tropical Mesas 2026" })).toBe("Tropical Mesas 2026.qrproj.json");
    expect(projectFileName({ name: "" })).toBe("proyecto.qrproj.json");
    expect(projectFileName({ name: "a/b:c" })).toBe("a_b_c.qrproj.json");
  });
});
