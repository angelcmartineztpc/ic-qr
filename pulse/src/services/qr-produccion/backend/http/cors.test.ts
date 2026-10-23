import { describe, expect, it } from "vitest";

import { bearerToken, clientIp } from "./auth";
import { corsHeaders, hasContentType, parseOrigins } from "./cors";
import { HttpError, jsonError } from "./errors";
import { readBodyCapped, readJsonCapped } from "./read-body";

describe("CORS", () => {
  it("sin lista (o con *) abre a cualquier origen; con lista solo devuelve el origen permitido", () => {
    expect(corsHeaders("https://a.com", [])["Access-Control-Allow-Origin"]).toBe("*");
    expect(corsHeaders(null, ["*"])["Access-Control-Allow-Origin"]).toBe("*");
    expect(corsHeaders("https://pulse.example.com", ["https://pulse.example.com"])).toMatchObject({ "Access-Control-Allow-Origin": "https://pulse.example.com", Vary: "Origin" });
    expect(corsHeaders("https://evil.com", ["https://pulse.example.com"])).not.toHaveProperty("Access-Control-Allow-Origin");
  });

  it("autoriza las cabeceras que usa el cliente (JWT, If-Match, cabeceras de importación)", () => {
    const allowed = corsHeaders(null, [])["Access-Control-Allow-Headers"] ?? "";
    for (const name of ["authorization", "apikey", "if-match", "x-file-name", "x-column-mapping", "x-import-truncate", "x-default-menu-url"]) expect(allowed).toContain(name);
  });

  it("parseOrigins ignora vacíos y espacios", () => {
    expect(parseOrigins(" https://a.com, ,https://b.com ")).toEqual(["https://a.com", "https://b.com"]);
    expect(parseOrigins(undefined)).toEqual([]);
  });

  it("hasContentType compara el tipo exacto, sin parámetros", () => {
    expect(hasContentType(new Headers({ "content-type": "application/json; charset=utf-8" }), ["application/json"])).toBe(true);
    expect(hasContentType(new Headers({ "content-type": "text/html" }), ["application/json"])).toBe(false);
    expect(hasContentType(new Headers(), ["application/json"])).toBe(false);
  });
});

describe("auth", () => {
  const jwt = "aaa.bbb.ccc";
  it("extrae el JWT; sin él, 401 en español", () => {
    expect(bearerToken(new Headers({ authorization: `Bearer ${jwt}` }))).toBe(jwt);
    for (const header of [undefined, "", "Basic abc", "Bearer", "Bearer sin-puntos", "Bearer a.b"]) {
      const headers = new Headers(header === undefined ? {} : { authorization: header });
      expect(() => bearerToken(headers), String(header)).toThrow(HttpError);
    }
    try {
      bearerToken(new Headers());
    } catch (error) {
      expect(error).toMatchObject({ status: 401, code: "UNAUTHORIZED", message: expect.stringContaining("Inicia sesión") });
    }
  });

  it("clientIp toma el primer salto de x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers())).toBe("anonymous");
  });
});

describe("errores y lectura del cuerpo", () => {
  it("jsonError devuelve AppErrorPayload con la referencia", async () => {
    const response = jsonError(429, "RATE_LIMITED", "Demasiadas solicitudes", { requestId: "req-1", headers: { "Retry-After": "5" } });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(await response.json()).toEqual({ code: "RATE_LIMITED", message: "Demasiadas solicitudes", requestId: "req-1" });
  });

  it("el cuerpo se lee con límite (413) y el JSON inválido es 400", async () => {
    const big = new Request("https://x.test", { method: "POST", body: "x".repeat(100) });
    await expect(readBodyCapped(big, 50)).rejects.toMatchObject({ status: 413 });
    await expect(readJsonCapped(new Request("https://x.test", { method: "POST", body: "{no" }), 50)).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
    await expect(readJsonCapped(new Request("https://x.test", { method: "POST", body: '{"a":1}' }), 50)).resolves.toEqual({ a: 1 });
  });
});
