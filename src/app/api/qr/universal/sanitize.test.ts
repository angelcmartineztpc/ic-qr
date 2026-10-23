import { describe, expect, it } from "vitest";

import { encodeMatrix } from "@/lib/qr/encode";
import { styledQrNodes } from "@/lib/qr-style";
import { renderSceneSvg } from "@/lib/svg/render-scene";
import { sanitizeExternalSvg } from "@/server/qr/sanitize-svg";
import { DEFAULT_QR_STYLE } from "@/schemas/qr-style";
import type { HexColor } from "@/types";

describe("SVG del generador rápido", () => {
  it("es solo geometría y pasa el saneado del servidor", () => {
    const { nodes } = styledQrNodes({
      box: { x: 0, y: 0, width: 50 },
      matrix: encodeMatrix("https://example.com"),
      quietZoneModules: 4,
      style: { ...DEFAULT_QR_STYLE, outline: "circle" },
      base: { dark: "#000000" as HexColor, light: "#FFFFFF" as HexColor },
      includeBackground: true,
    });
    const svg = renderSceneSvg({ widthMm: 50, heightMm: 50, nodes, warnings: [], meta: { recordId: "u", templateId: "Universal", templateVersion: "1.0" } });
    expect(svg).not.toMatch(/<image|<text/);
    expect(() => sanitizeExternalSvg(new TextEncoder().encode(svg))).not.toThrow();
  });
});
