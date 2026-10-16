import { describe, expect, it } from "vitest";

import { isOwnLink, isStableResortLink, shortCodeOf, shortUrlFor } from "./own-links";

describe("links propios", () => {
  it("reconoce un link corto y devuelve su código en minúsculas", () => {
    expect(shortCodeOf("https://qr.example.com/s/ab3de9xk")).toBe("ab3de9xk");
    expect(shortCodeOf("https://qr.example.com/s/AB3DE9XK")).toBe("ab3de9xk");
  });

  it("rechaza códigos mal formados, con parámetros o en otra ruta", () => {
    for (const url of ["https://qr.example.com/s/abc", "https://qr.example.com/s/ab3de9x0", "https://qr.example.com/s/ab3de9xk?x=1", "https://qr.example.com/s/ab3de9xk#a", "https://qr.example.com/x/ab3de9xk", "no es url"]) {
      expect(shortCodeOf(url), url).toBeNull();
    }
  });

  it("reconoce el link estable de un resort y servicio conocidos, y solo esos", () => {
    expect(isStableResortLink("https://qr.example.com/api/qr/TGPC/pool")).toBe(true);
    expect(isStableResortLink("https://qr.example.com/api/qr/XXXX/pool")).toBe(false);
    expect(isStableResortLink("https://qr.example.com/api/qr/TGPC/spa")).toBe(false);
    expect(isStableResortLink("https://qr.example.com/api/qr/TGPC/pool?x=1")).toBe(false);
  });

  it("un link ajeno, largo o no, no es propio", () => {
    expect(isOwnLink("https://menu.example.com/carta?id=1")).toBe(false);
    expect(isOwnLink("https://qr.example.com/s/ab3de9xk")).toBe(true);
    expect(isOwnLink("https://qr.example.com/api/qr/TGPC/pool")).toBe(true);
  });

  it("arma el link corto sin barras dobles", () => {
    expect(shortUrlFor("https://qr.example.com/", "ab3de9xk")).toBe("https://qr.example.com/s/ab3de9xk");
  });
});

describe("dominio con ruta (Edge Function)", () => {
  const base = "https://abc.supabase.co/functions/v1/qr-enlaces";

  it("ownBasePath saca la ruta del dominio configurado", async () => {
    const { ownBasePath } = await import("./own-links");
    expect(ownBasePath(base)).toBe("/functions/v1/qr-enlaces");
    expect(ownBasePath(`${base}/`)).toBe("/functions/v1/qr-enlaces");
    expect(ownBasePath("https://qr.example.com")).toBe("");
    expect(ownBasePath(undefined)).toBe("");
  });

  it("reconoce los links propios con esa ruta y no confunde otras rutas", async () => {
    const { isOwnLink, shortCodeOf } = await import("./own-links");
    const path = "/functions/v1/qr-enlaces";
    expect(shortCodeOf(`${base}/s/ab3de9xk`, path)).toBe("ab3de9xk");
    expect(shortCodeOf(`https://abc.supabase.co/s/ab3de9xk`, path)).toBeNull();
    expect(isOwnLink(`${base}/api/qr/TGPC/pool`, path)).toBe(true);
    expect(isOwnLink(`${base}/api/qr/NOPE/pool`, path)).toBe(false);
  });
});
