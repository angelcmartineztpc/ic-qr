import { describe, expect, it } from "vitest";

import { parseEnv } from "./env-schema";

const noFile = (path: string): string => {
  throw new Error(`no se esperaba leer ${path}`);
};

const prodBase = {
  NODE_ENV: "production",
  AUTH_MODE: "basic",
  BASIC_AUTH_USER: "diseno",
  BASIC_AUTH_PASSWORD_SHA256: "a".repeat(64),
  APP_ORIGINS: "https://qr.example.com",
  APP_ALLOWED_HOSTS: "qr.example.com",
  STORAGE_PROVIDER: "s3",
  STORAGE_BUCKET: "qr",
  STORAGE_PUBLIC_BASE_URL: "https://cdn.example.com",
};

describe("parseEnv", () => {
  it("usa valores por defecto seguros en desarrollo", () => {
    const env = parseEnv({}, noFile);
    expect(env.AUTH_MODE).toBe("none");
    expect(env.STORAGE_PROVIDER).toBe("local");
    expect(env.APP_ALLOWED_HOSTS).toContain("localhost:3000");
    expect(env.IMPORT_MAX_ROWS).toBe(5000);
  });

  it("acepta una configuración de producción completa", () => {
    const env = parseEnv(prodBase, noFile);
    expect(env.APP_ORIGINS).toEqual(["https://qr.example.com"]);
  });

  it("impide arrancar en producción sin autenticación", () => {
    expect(() => parseEnv({ ...prodBase, AUTH_MODE: "none" }, noFile)).toThrow(/AUTH_MODE=none/);
    expect(() => parseEnv({ ...prodBase, AUTH_MODE: "none", ALLOW_UNAUTHENTICATED: "true" }, noFile)).not.toThrow();
  });

  it("exige el hash SHA-256 en modo basic", () => {
    expect(() => parseEnv({ ...prodBase, BASIC_AUTH_PASSWORD_SHA256: "plaintext" }, noFile)).toThrow(
      /BASIC_AUTH_PASSWORD_SHA256/,
    );
  });

  it("exige orígenes y hosts en producción", () => {
    expect(() => parseEnv({ ...prodBase, APP_ORIGINS: "" }, noFile)).toThrow(/APP_ORIGINS/);
  });

  it("rechaza el storage local con base localhost en producción", () => {
    expect(() =>
      parseEnv({ ...prodBase, STORAGE_PROVIDER: "local", STORAGE_PUBLIC_BASE_URL: "http://localhost:3000/api/storage" }, noFile),
    ).toThrow(/storage local/);
  });

  it("impide arrancar con proxy de salida sin confirmación (SSRF)", () => {
    expect(() => parseEnv({ HTTPS_PROXY: "http://proxy:3128" }, noFile)).toThrow(/QR_FETCH_DIRECT_EGRESS_CONFIRMED/);
    expect(() => parseEnv({ HTTPS_PROXY: "http://proxy:3128", QR_FETCH_DIRECT_EGRESS_CONFIRMED: "true" }, noFile)).not.toThrow();
  });

  it("lee secretos desde *_FILE", () => {
    const env = parseEnv(
      { ...prodBase, BASIC_AUTH_PASSWORD_SHA256: undefined, BASIC_AUTH_PASSWORD_SHA256_FILE: "/run/secrets/pw" },
      (path) => (path === "/run/secrets/pw" ? `${"b".repeat(64)}\n` : ""),
    );
    expect(env.BASIC_AUTH_PASSWORD_SHA256).toBe("b".repeat(64));
  });

  it("reporta todos los problemas a la vez", () => {
    expect(() => parseEnv({ NODE_ENV: "production", AUTH_MODE: "proxy" }, noFile)).toThrow(
      /PROXY_SHARED_SECRET[\s\S]*APP_ORIGINS[\s\S]*APP_ALLOWED_HOSTS/,
    );
  });
});
