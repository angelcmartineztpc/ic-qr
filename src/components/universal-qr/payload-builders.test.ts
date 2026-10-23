import { describe, expect, it } from "vitest";

import { buildPayloadString, DEFAULT_UNIVERSAL_DATA, safeMatrixOf } from "./payload-builders";

describe("payload-builders para generador universal de QR", () => {
  it("genera payload de URL limpia", () => {
    expect(buildPayloadString({ ...DEFAULT_UNIVERSAL_DATA, type: "url", url: "https://mihotel.com/menu" })).toBe(
      "https://mihotel.com/menu",
    );
  });

  it("genera payload estándar WIFI con caracteres escapados", () => {
    const wifi = buildPayloadString({
      ...DEFAULT_UNIVERSAL_DATA,
      type: "wifi",
      wifi: { ssid: "Hotel;Lobby", password: "pass:123", encryption: "WPA", hidden: true },
    });
    expect(wifi).toBe("WIFI:T:WPA;S:Hotel\\;Lobby;P:pass\\:123;H:true;;");
  });

  it("genera payload vCard 3.0 estructurado", () => {
    const vcard = buildPayloadString({
      ...DEFAULT_UNIVERSAL_DATA,
      type: "vcard",
      vcard: {
        firstName: "Ana",
        lastName: "Gómez",
        organization: "Palace Resorts",
        title: "Gerente",
        phone: "+529981234567",
        email: "ana@palace.com",
        website: "https://palace.com",
      },
    });
    expect(vcard).toContain("BEGIN:VCARD");
    expect(vcard).toContain("FN:Ana Gómez");
    expect(vcard).toContain("ORG:Palace Resorts");
    expect(vcard).toContain("TEL;TYPE=CELL:+529981234567");
    expect(vcard).toContain("END:VCARD");
  });

  it("genera enlace de WhatsApp con mensaje codificado", () => {
    const wa = buildPayloadString({
      ...DEFAULT_UNIVERSAL_DATA,
      type: "whatsapp",
      whatsapp: { phone: "+52 (55) 1234-5678", message: "Hola mundo" },
    });
    expect(wa).toBe("https://wa.me/525512345678?text=Hola%20mundo");
  });

  it("genera enlace mailto con asunto y cuerpo", () => {
    const mail = buildPayloadString({
      ...DEFAULT_UNIVERSAL_DATA,
      type: "email",
      email: { to: "ventas@hotel.com", subject: "Reserva", body: "Quisiera reservar" },
    });
    expect(mail).toBe("mailto:ventas@hotel.com?subject=Reserva&body=Quisiera+reservar");
  });

  it("codifica matriz QR válida para cualquier tipo de payload", () => {
    const m = safeMatrixOf("WIFI:T:WPA;S:Test;P:12345678;H:false;;");
    expect(m.length).toBeGreaterThanOrEqual(21);
  });
});

