import { describe, expect, it } from "vitest";

import { rowsForPage, summarize } from "./models";
import { auditCsv } from "./report";

describe("auditoría", () => {
  it("genera filas por página: con QR, ilegible y sin QR", () => {
    const checks = new Map([["https://a.com/", { status: "ok" as const, httpStatus: 200 }]]);
    expect(rowsForPage({ page: 1, piece: "P1", payloads: ["https://a.com/"], undecoded: 1 }, checks).map((r) => r.status)).toEqual(["ok", "illegible"]);
    expect(rowsForPage({ page: 2, piece: "P2", payloads: [], undecoded: 0 }, checks)[0]?.status).toBe("no_qr");
  });

  it("resume sin contar las páginas sin QR", () => {
    const rows = [
      ...rowsForPage({ page: 1, piece: "a", payloads: ["x"], undecoded: 0 }, new Map([["x", { status: "broken" as const }]])),
      ...rowsForPage({ page: 2, piece: "b", payloads: [], undecoded: 0 }, new Map()),
    ];
    expect(summarize(rows, 2)).toEqual({ totalPages: 2, totalQr: 1, ok: 0, errors: 1, brokenLinks: 1 });
  });

  it("el CSV lleva BOM, escapa comas y neutraliza fórmulas", () => {
    const csv = auditCsv([{ piece: '=cmd,"x"', page: 1, url: "", status: "no_qr" }]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=cmd,""x"""`);
  });
});
