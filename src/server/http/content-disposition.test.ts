import { describe, expect, it } from "vitest";

import { attachment } from "./content-disposition";

describe("attachment", () => {
  it("incluye un nombre ASCII de respaldo y filename* UTF-8", () => {
    expect(attachment("Tropical_Mesas_2026.pdf")).toBe(
      `attachment; filename="Tropical_Mesas_2026.pdf"; filename*=UTF-8''Tropical_Mesas_2026.pdf`,
    );
    const header = attachment("Menú (Terraza) – 2026's.pdf");
    expect(header).toContain(`filename="Menu (Terraza)  2026's.pdf"`);
    expect(header).toContain("filename*=UTF-8''Men%C3%BA%20%28Terraza%29%20%E2%80%93%202026%27s.pdf");
  });
});
