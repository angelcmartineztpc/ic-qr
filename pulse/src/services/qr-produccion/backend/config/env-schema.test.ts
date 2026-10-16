import { describe, expect, it } from "vitest";

import { derivedUrls, parseQrEnv } from "./env-schema";

const BASE = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };

describe("parseQrEnv", () => {
  it("con solo lo que inyecta Supabase, todo tiene un valor por defecto seguro", () => {
    const env = parseQrEnv(BASE);
    expect(env).toMatchObject({ QR_HOST_POLICY: "public", QR_ALLOWED_ORIGINS: [], QR_KEY_PREFIX: "", QR_BUCKET: "qr-produccion", QR_FONTS_BUCKET: "qr-fuentes", QR_RESOLVE_MAX_BATCH: 50, EXPORT_MAX_RECORDS: 100, IMPORT_MAX_ROWS: 5000, QR_FETCH_MAX_BYTES: 524_288 });
  });

  it("lee listas separadas por comas y enteros desde texto", () => {
    const env = parseQrEnv({ ...BASE, QR_ALLOWED_ORIGINS: " https://pulse.example.com , https://staging.example.com ", EXPORT_MAX_RECORDS: "300", QR_HOST_POLICY: "allowlist", QR_ALLOWED_HOSTS: "qr.cliente.com,.cdn.cliente.com" });
    expect(env.QR_ALLOWED_ORIGINS).toEqual(["https://pulse.example.com", "https://staging.example.com"]);
    expect(env.EXPORT_MAX_RECORDS).toBe(300);
    expect(env.QR_ALLOWED_HOSTS).toEqual(["qr.cliente.com", ".cdn.cliente.com"]);
  });

  it("falla con TODOS los problemas juntos, en español, y sin mostrar el valor de los secretos", () => {
    const run = () => parseQrEnv({ SUPABASE_URL: "no", SUPABASE_ANON_KEY: "", QR_KEY_PREFIX: "Mal/Prefijo", QR_FETCH_TIMEOUT_MS: "10" });
    expect(run).toThrow(/Configuración de entorno inválida/);
    try {
      run();
    } catch (error) {
      const message = (error as Error).message;
      for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "QR_KEY_PREFIX", "QR_FETCH_TIMEOUT_MS"]) expect(message).toContain(name);
      expect(message).toContain("falta (lo inyecta Supabase)");
    }
  });

  it("la lista blanca de hosts no puede quedar vacía", () => {
    expect(() => parseQrEnv({ ...BASE, QR_HOST_POLICY: "allowlist" })).toThrow(/QR_ALLOWED_HOSTS/);
  });

  it("el dominio público de los links debe ser https (http solo en localhost)", () => {
    expect(() => parseQrEnv({ ...BASE, QR_PUBLIC_BASE: "http://qr.palace.com" })).toThrow(/https/);
    expect(parseQrEnv({ ...BASE, QR_PUBLIC_BASE: "http://localhost:54321/functions/v1/qr-enlaces" }).QR_PUBLIC_BASE).toContain("localhost");
    expect(parseQrEnv({ ...BASE, QR_PUBLIC_BASE: "https://qr.palace.com" }).QR_PUBLIC_BASE).toBe("https://qr.palace.com");
  });
});

describe("derivedUrls", () => {
  it("usa las funciones del propio proyecto cuando no hay dominio configurado", () => {
    expect(derivedUrls(parseQrEnv(BASE))).toEqual({ functionsBase: "https://abc.supabase.co/functions/v1", linksFallbackBase: "https://abc.supabase.co/functions/v1/qr-enlaces", storagePublicBase: "https://abc.supabase.co/functions/v1/qr-resolver/storage" });
    expect(derivedUrls(parseQrEnv({ ...BASE, QR_STORAGE_PUBLIC_BASE: "https://qr.palace.com/files/" })).storagePublicBase).toBe("https://qr.palace.com/files");
  });
});
