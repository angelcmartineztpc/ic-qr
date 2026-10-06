import { describe, expect, it } from "vitest";

import type { QRRecord } from "@/types";

import { duplicateInFileIssue, importIssueFromCheck } from "./import-issues";
import { formatIssueLine } from "./messages.es";
import { urlDedupKey, usesPlainHttp } from "./url";
import { checkField, validateDraft, validateRecord } from "./validate";

const VALID = {
  area: "Tropical",
  estacion: "Bar",
  mesa: "M1",
  subgrupo: "Terraza",
  concepto: "Comida",
  menuUrl: "https://menu.example.com/tropical",
};

function issueLine(row: number, field: Parameters<typeof checkField>[0], value: string): string {
  const result = checkField(field, value);
  if (result.ok) throw new Error("se esperaba un error");
  return formatIssueLine(importIssueFromCheck(row, result.issue));
}

describe("ejemplos del spec (§6 y §29)", () => {
  it("reproduce las líneas exactas de la lista de errores", () => {
    expect(issueLine(18, "menuUrl", "")).toBe("Fila 18: Falta Link del menú");
    expect(issueLine(32, "mesa", "   ")).toBe("Fila 32: Mesa vacía");
    expect(issueLine(56, "menuUrl", "www menu")).toBe("Fila 56: Link del menú inválido");
    expect(formatIssueLine(duplicateInFileIssue(80, 12, ["area", "mesa"]))).toBe(
      "Fila 80: Registro duplicado (igual a fila 12)",
    );
  });

  it("produce el ImportIssue de §29 para un link inválido", () => {
    const result = checkField("menuUrl", "hola");
    if (result.ok) throw new Error("se esperaba un error");
    expect(importIssueFromCheck(23, result.issue)).toMatchObject({
      row: 23,
      field: "menuUrl",
      value: "hola",
      message: "El link del menú no es una URL válida",
      severity: "error",
      code: "INVALID_URL",
    });
  });

  it("los duplicados son avisos, nunca errores", () => {
    expect(duplicateInFileIssue(80, 12, ["area"]).severity).toBe("warning");
  });
});

describe("validateDraft", () => {
  it("acepta un registro válido y canoniza el link del menú", () => {
    const result = validateDraft({ ...VALID, menuUrl: "HTTPS://Menu.Example.com/tropical" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.menuUrl).toBe("https://menu.example.com/tropical");
      expect(result.draft.qrUrl).toBeUndefined();
    }
  });

  it("los campos son texto libre (decisión R1): Mesa admite cualquier formato", () => {
    for (const mesa of ["M1", "1", "Terraza 4", "VIP-A", "Mesa #12 (exterior)"]) {
      expect(validateDraft({ ...VALID, mesa }).ok).toBe(true);
    }
  });

  it("Estación, Sub-grupo y Concepto son opcionales; Área, Mesa y Link del menú obligatorios", () => {
    expect(validateDraft({ ...VALID, estacion: "", subgrupo: undefined, concepto: null }).ok).toBe(true);
    const result = validateDraft({ estacion: "Bar" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((i) => `${i.field}.${i.code}`)).toEqual([
        "area.REQUIRED_EMPTY",
        "mesa.REQUIRED_EMPTY",
        "menuUrl.REQUIRED_EMPTY",
      ]);
    }
  });

  it("normaliza el texto (espacios, invisibles, NFC)", () => {
    const result = validateDraft({ ...VALID, area: "  Tro​pical  ", mesa: "M‮1" });
    expect(result.ok && result.draft.area).toBe("Tropical");
    expect(result.ok && result.draft.mesa).toBe("M1");
  });

  it("rechaza textos demasiado largos", () => {
    const result = validateDraft({ ...VALID, mesa: "x".repeat(41) });
    expect(!result.ok && result.issues[0]?.code).toBe("TOO_LONG");
  });

  it("avisa (sin bloquear) si el link del menú usa http", () => {
    const result = validateDraft({ ...VALID, menuUrl: "http://menu.example.com" });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toEqual(["HTTP_URL"]);
  });

  it("Link del QR: vacío = se generará; presente debe ser https", () => {
    const empty = validateDraft({ ...VALID, qrUrl: "   " });
    expect(empty.ok && empty.draft.qrUrl).toBeUndefined();

    const https = validateDraft({ ...VALID, qrUrl: "https://cdn.example.com/qr/m1.svg" });
    expect(https.ok && https.draft.qrUrl).toBe("https://cdn.example.com/qr/m1.svg");

    const http = validateDraft({ ...VALID, qrUrl: "http://cdn.example.com/qr/m1.svg" });
    expect(!http.ok && http.issues[0]).toMatchObject({ field: "qrUrl", code: "INVALID_URL" });
  });
});

describe("URLs peligrosas (spec §31)", () => {
  const rejected = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "vbscript:msgbox(1)",
    "blob:https://example.com/uuid",
    "about:blank",
    "ftp://example.com/menu",
    "https://user:pass@example.com/menu",
    "https://example.com/menu con espacio",
    "https://exa​mple.com",
    "https://localhost/menu",
    "https://127.0.0.1/menu",
    "https://192.168.1.10/menu",
    "https://[::1]/menu",
    "//example.com/menu",
    "example.com/menu",
    "https://",
    "https://пример.рф",
    `https://example.com/${"a".repeat(2050)}`,
  ];
  it.each(rejected)("rechaza %s", (url) => {
    expect(checkField("menuUrl", url).ok).toBe(false);
  });

  const accepted = [
    "https://example.com",
    "https://menu.example.com/tropical?mesa=M1#arriba",
    "http://menu.example.com/m1",
    "https://example.com:8443/menu",
    "https://sub.dominio.mx/menú",
    "  https://example.com/espacios-alrededor  ",
    "https://qr.internal/menu",
    "https://xn--80ak6aa92e.com",
    "https://example.com/path/%20encoded",
  ];
  it.each(accepted)("acepta %s", (url) => {
    expect(checkField("menuUrl", url).ok).toBe(true);
  });
});

describe("urlDedupKey", () => {
  it("canoniza host y quita el fragmento, sin tocar path ni query", () => {
    expect(urlDedupKey("HTTPS://Menu.Example.com/A?x=1#top")).toBe("https://menu.example.com/A?x=1");
    expect(urlDedupKey("https://menu.example.com")).toBe(urlDedupKey("https://menu.example.com/"));
    expect(urlDedupKey("https://e.com/a?b=1&a=2")).not.toBe(urlDedupKey("https://e.com/a?a=2&b=1"));
  });
  it("no falla con texto que no es URL", () => {
    expect(urlDedupKey(" Hola ")).toBe("hola");
    expect(usesPlainHttp("hola")).toBe(false);
  });
});

describe("validateRecord", () => {
  const base: QRRecord = {
    id: "r1",
    ...VALID,
    qrStatus: "pending",
    qr: { source: "none" },
    order: 0,
    validationErrors: [],
    metadata: { origin: "manual" },
    createdAt: "2026-10-06T10:00:00.000Z",
    updatedAt: "2026-10-06T10:00:00.000Z",
  };

  it("un registro correcto no tiene errores", () => {
    expect(validateRecord(base)).toEqual([]);
  });

  it("un registro guardado con datos inválidos carga, pero queda marcado (schema tolerante)", () => {
    const issues = validateRecord({ ...base, menuUrl: "hola", area: "" });
    expect(issues.map((i) => `${i.field}.${i.code}.${i.severity}`)).toEqual([
      "area.REQUIRED_EMPTY.error",
      "menuUrl.INVALID_URL.error",
    ]);
  });

  it("detecta violaciones del invariante qr.source/qrUrl", () => {
    expect(validateRecord({ ...base, qrUrl: "https://x.com/q.svg" })[0]?.code).toBe("INVARIANT");
    expect(validateRecord({ ...base, qr: { source: "existing", assetKind: "unknown", verification: "unchecked" } })[0]?.code).toBe(
      "INVARIANT",
    );
  });

  it("acepta el qrUrl generado del provider local (localhost / IP LAN)", () => {
    const generated: QRRecord = {
      ...base,
      qrStatus: "generated",
      qrUrl: "http://192.168.1.20:3000/api/storage/qr/v1/" + "a".repeat(64) + ".svg",
      qr: {
        source: "generated",
        storageKey: `qr/v1/${"a".repeat(64)}.svg`,
        payload: VALID.menuUrl,
        contentHash: "a".repeat(64),
        svgSha256: "b".repeat(64),
        rendererVersion: "qrsvg-1+qr@0.7.2",
        generatedAt: "2026-10-06T10:00:00.000Z",
      },
    };
    expect(validateRecord(generated)).toEqual([]);
  });
});
