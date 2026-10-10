import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import { generatedRecord, existingRecord } from "../../tests/helpers/records";
import { listTemplates, getTemplate, DEFAULT_TEMPLATE_ID } from "@/templates";
import { resolveTemplate, switchTemplate } from "@/lib/template/resolve";
import type { HexColor, QRRecord, Template } from "@/types";

import { ColumnMappingHeaderSchema, encodeColumnMappingHeader, QrResolveRequestSchema } from "./api";
import { ExportOptionsSchema, ExportRequestSchema } from "./export";
import { type ColorSchema, LayoutSchema } from "./geometry";
import { PDF_DEFAULTS, PDFOptionsSchema } from "./pdf";
import { PersistedProjectSchema, ProjectFileSchema } from "./project";
import { ExportRecordSchema, type StoredRecordSchema } from "./record";
import { TemplateOverridesSchema, TemplateSchema } from "./template";

const tropical = (): Template => {
  const template = getTemplate("tropical-table");
  if (!template) throw new Error("falta tropical-table");
  return template;
};

describe("tipos derivados de los schemas", () => {
  it("QRRecord es exactamente la salida de StoredRecordSchema y HexColor es `#${string}`", () => {
    expectTypeOf<z.output<typeof StoredRecordSchema>>().toEqualTypeOf<QRRecord>();
    expectTypeOf<z.output<typeof ColorSchema>>().toEqualTypeOf<HexColor>();
    expectTypeOf<HexColor>().toEqualTypeOf<`#${string}`>();
  });
});

describe("PDFOptions", () => {
  it("los valores por defecto (literales) son válidos: A4, márgenes 10, gap 5, contornos", () => {
    expect(PDFOptionsSchema.parse({})).toEqual(PDF_DEFAULTS);
    expect(PDFOptionsSchema.parse(PDF_DEFAULTS)).toEqual(PDF_DEFAULTS);
  });

  it("rechaza márgenes negativos y páginas absurdas", () => {
    expect(PDFOptionsSchema.safeParse({ margins: { top: -5, right: 0, bottom: 0, left: 0 } }).success).toBe(false);
    expect(PDFOptionsSchema.safeParse({ pageSize: { kind: "custom", widthMm: 5, heightMm: 5 } }).success).toBe(false);
  });
});

describe("Layout", () => {
  it("el área del QR debe ser cuadrada", () => {
    const layout = { qr: { x: 13, y: 24, width: 24, height: 20 }, content: { x: 4, y: 3, width: 42, height: 20 } };
    expect(LayoutSchema.safeParse(layout).success).toBe(false);
  });
});

describe("plantillas", () => {
  it("todas las plantillas registradas son válidas y usan la tipografía de las piezas", () => {
    const templates = listTemplates();
    expect(templates.map((t) => t.id)).toEqual(["tropical-table", "restaurant-default", "custom-template"]);
    for (const template of templates) {
      expect(template.fonts.every((font) => font.family === "Address Sans Pro Cd")).toBe(true);
      expect(template.fontDir).toBe("address-sans");
    }
    expect(DEFAULT_TEMPLATE_ID).toBe("tropical-table");
  });

  it("TropicalTable reproduce la referencia QR_Tropical_1M_Alimentos.pdf: 70 mm, textos literales, marco y QR abajo", () => {
    const template = tropical();
    expect(template.tile).toMatchObject({ width: 70, height: 70 });
    expect(template.content.items.map((i) => i.text)).toEqual([
      "{{area}}",
      "MESA – TABLE",
      "{{mesa}}",
      "CONSULTA EL MENU Y ORDENA EN LÍNEA",
      "LOOK AT THE MENU AN ORDER ON LINE",
    ]);
    expect(template.content.items.map((i) => i.sizePt)).toEqual([17, 11, 22, 13.2, 13.2]);
    expect(template.shapes.map((shape) => shape.id)).toEqual(["frame"]);
    expect(template.defaultLayout.qr).toEqual({ x: 22.606, y: 39.424, width: 24.788, height: 24.788 });
    expect(template.qr.quietZoneModules).toBe(0);
  });

  it("rechaza campos desconocidos, fuentes no declaradas y cajas fuera de la pieza", () => {
    const base = structuredClone(tropical());
    expect(TemplateSchema.safeParse({ ...base, content: { ...base.content, items: [{ ...base.content.items[0], text: "{{precio}}" }] } }).success).toBe(false);
    expect(TemplateSchema.safeParse({ ...base, defaultLayout: { ...base.defaultLayout, qr: { x: 50, y: 50, width: 24, height: 24 } } }).success).toBe(false);
    const undeclared = { ...base, content: { ...base.content, items: [{ ...base.content.items[0], font: { family: "Address Sans Pro Cd", weight: 300, style: "normal" } }] } };
    expect(TemplateSchema.safeParse(undeclared).success).toBe(false);
  });

  it("resolveTemplate aplica overrides y re-valida (un peso no declarado falla)", () => {
    const overrides = TemplateOverridesSchema.parse({ items: { label: { text: "MESA · TABLE", sizePt: 6.5 }, ctaEn: { hidden: true } }, qr: { quietZoneModules: 3 } });
    const resolved = resolveTemplate(tropical(), overrides);
    expect(resolved.success).toBe(true);
    if (resolved.success) {
      expect(resolved.data.content.items.find((i) => i.id === "label")).toMatchObject({ text: "MESA · TABLE", sizePt: 6.5 });
      expect(resolved.data.content.items.some((i) => i.id === "ctaEn")).toBe(false);
      expect(resolved.data.qr.quietZoneModules).toBe(3);
    }
    const badWeight = TemplateOverridesSchema.parse({ items: { area: { weight: 300 } } });
    expect(resolveTemplate(tropical(), badWeight).success).toBe(false);
  });

  it("switchTemplate cambia el layout base, vacía posiciones y conserva overrides aplicables", () => {
    const next = getTemplate("restaurant-default");
    if (!next) throw new Error("falta restaurant-default");
    const result = switchTemplate(next, {
      layout: { templateId: "tropical-table", base: tropical().defaultLayout, overrides: { r1: {}, r2: {} } },
      templateOverrides: TemplateOverridesSchema.parse({ items: { area: { sizePt: 11 }, ctaEs: { hidden: true } } }),
    });
    expect(result.layout).toEqual({ templateId: "restaurant-default", base: next.defaultLayout, overrides: {} });
    expect(result.lostOverrides).toBe(2);
    expect(Object.keys(result.templateOverrides.items)).toEqual(["area"]);
  });
});

describe("ExportRecord / ExportRequest (frontera de /api/export)", () => {
  const exportable = (record: QRRecord) => ({
    id: record.id,
    area: record.area,
    estacion: record.estacion,
    mesa: record.mesa,
    subgrupo: record.subgrupo,
    concepto: record.concepto,
    menuUrl: record.menuUrl,
    qrUrl: record.qrUrl ?? "",
    qr: record.qr,
    ...(record.qrAck ? { qrAck: record.qrAck } : {}),
  });

  it("acepta generados y existentes verificados", () => {
    expect(ExportRecordSchema.safeParse(exportable(generatedRecord())).success).toBe(true);
    expect(ExportRecordSchema.safeParse(exportable(existingRecord())).success).toBe(true);
  });

  it("rechaza QR no resueltos, stale sin ack y existentes que no coinciden", () => {
    const { qrUrl: _q, ...pending } = generatedRecord();
    expect(ExportRecordSchema.safeParse(exportable({ ...pending, qr: { source: "none" } })).success).toBe(false);
    expect(ExportRecordSchema.safeParse(exportable(generatedRecord({ menuUrl: "https://menu.example.com/otro" }))).success).toBe(false);
    const mismatch = existingRecord();
    expect(
      ExportRecordSchema.safeParse(exportable({ ...mismatch, qr: { ...mismatch.qr, source: "existing", assetKind: "svg", verification: "decoded", decodedPayload: "https://otra.com" } }))
        .success,
    ).toBe(false);
  });

  it("no deja pasar datos inválidos al generador de PDF (spec §27)", () => {
    expect(ExportRecordSchema.safeParse({ ...exportable(generatedRecord()), mesa: "" }).success).toBe(false);
    expect(ExportRecordSchema.safeParse({ ...exportable(generatedRecord()), extra: "x" }).success).toBe(false);
  });

  it("templateId y layout.templateId deben coincidir; sin ids repetidos", () => {
    const template = tropical();
    const request = {
      records: [exportable(generatedRecord())],
      templateId: "tropical-table",
      templateOverrides: {},
      layout: { templateId: "tropical-table", base: template.defaultLayout, overrides: {} },
      options: { fileName: "Tropical_Mesas_2026", pdf: {} },
    };
    expect(ExportRequestSchema.safeParse(request).success).toBe(true);
    expect(ExportRequestSchema.safeParse({ ...request, templateId: "restaurant-default" }).success).toBe(false);
    expect(ExportRequestSchema.safeParse({ ...request, records: [request.records[0], request.records[0]] }).success).toBe(false);
    expect(ExportOptionsSchema.parse(request.options).formats).toEqual(["pdf"]);
  });
});

describe("API", () => {
  it("X-Column-Mapping: ida y vuelta en base64url con UTF-8", () => {
    const header = encodeColumnMappingHeader([{ column: "C", field: "mesa" }, { column: "H", field: null }]);
    expect(header).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(ColumnMappingHeaderSchema.parse(header)).toEqual([{ column: "C", field: "mesa" }, { column: "H", field: null }]);
    expect(ColumnMappingHeaderSchema.safeParse("no válido!").success).toBe(false);
    expect(ColumnMappingHeaderSchema.safeParse(btoa("{")).success).toBe(false);
  });

  it("/api/qr/resolve: lotes acotados y no vacíos", () => {
    expect(QrResolveRequestSchema.safeParse({ items: [] }).success).toBe(false);
    expect(QrResolveRequestSchema.safeParse({ items: Array.from({ length: 101 }, () => ({})) }).success).toBe(false);
    expect(QrResolveRequestSchema.safeParse({ items: [{ recordId: "r1", menuUrl: "https://a.com", expectedRevision: 0 }] }).success).toBe(true);
  });
});

describe("archivo de proyecto", () => {
  it("valida la envoltura y deja los registros para la hidratación tolerante", () => {
    const template = tropical();
    const project = {
      schemaVersion: 2,
      projectId: "p1",
      name: "Tropical",
      recordsById: { broken: { cualquier: "cosa" } },
      order: ["broken"],
      templateId: "tropical-table",
      templateOverrides: {},
      layout: { templateId: "tropical-table", base: template.defaultLayout, overrides: {} },
      exportOptions: { fileName: "", formats: ["pdf"], pdf: PDF_DEFAULTS, svg: { textMode: "outlined", cutLine: false }, zipNaming: "index" },
      fileNameTouched: false,
      duplicateKey: { fields: [], caseInsensitive: true, canonicalUrl: true },
      revision: 3,
      savedRevision: 1,
    };
    const parsed = PersistedProjectSchema.parse(project);
    expect(parsed.quarantine).toEqual([]);
    expect(parsed.duplicateKey.fields).toHaveLength(6); // clave inválida → valor por defecto
    expect(ProjectFileSchema.safeParse({ format: "qr-production-project", schemaVersion: 2, exportedAt: "2026-10-06T10:00:00Z", project }).success).toBe(true);
    expect(ProjectFileSchema.safeParse({ format: "otro", schemaVersion: 2, exportedAt: "2026-10-06T10:00:00Z", project }).success).toBe(false);
  });
});
