import { describe, expect, it } from "vitest";

import { HttpError } from "../http/errors";
import { infoOf, linkBase, linkErrorToHttp, ownHostsOf, revisionFromIfMatch, routeLinks, validCode } from "./routes";
import { LinkError } from "./service";

describe("routeLinks", () => {
  it.each([
    ["POST", "/functions/v1/qr-enlaces/shorten", { kind: "shorten" }],
    ["POST", "/qr-enlaces/records-excel", { kind: "records-excel" }],
    ["GET", "/qr-enlaces/s/AB3DE9XK", { kind: "redirect", code: "ab3de9xk" }],
    ["GET", "/s/ab3de9xk", { kind: "redirect", code: "ab3de9xk" }],
    ["GET", "/qr-enlaces/links/ab3de9xk", { kind: "info", code: "ab3de9xk" }],
    ["PATCH", "/qr-enlaces/links/ab3de9xk", { kind: "update", code: "ab3de9xk" }],
    ["GET", "/qr-enlaces/api/qr/PRPL/pool", { kind: "stable", pathname: "/qr-enlaces/api/qr/PRPL/pool" }],
  ])("%s %s", (method, path, expected) => {
    expect(routeLinks(method, path)).toEqual(expected);
  });

  it("lo demás es «no encontrado» (método equivocado, rutas sobrantes)", () => {
    for (const [method, path] of [["GET", "/qr-enlaces/shorten"], ["POST", "/qr-enlaces/s/ab3de9xk"], ["DELETE", "/qr-enlaces/links/ab3de9xk"], ["GET", "/qr-enlaces/s/ab3de9xk/x"], ["GET", "/qr-enlaces"]] as const) {
      expect(routeLinks(method, path), `${method} ${path}`).toEqual({ kind: "not-found" });
    }
  });
});

describe("ayudas de enlaces", () => {
  it("infoOf arma el link corto y oculta la versión interna", () => {
    const info = infoOf({ v: 1, code: "ab3de9xk", destination: "https://a.example.com/", originalUrl: "https://o.example.com/", createdAt: "2026-10-14T12:00:00.000Z", updatedAt: "2026-10-14T12:00:00.000Z", revision: 2, history: [] }, "https://f.test/functions/v1/qr-enlaces/");
    expect(info).toMatchObject({ code: "ab3de9xk", shortUrl: "https://f.test/functions/v1/qr-enlaces/s/ab3de9xk", revision: 2 });
    expect(info).not.toHaveProperty("v");
  });

  it("un código mal formado es 404, no 400", () => {
    expect(validCode("AB3DE9XK")).toBe("ab3de9xk");
    for (const bad of ["abc", "ab3de9x0", "../etc"]) expect(() => validCode(bad)).toThrowError(expect.objectContaining({ status: 404 }));
  });

  it("traduce los errores de dominio a HTTP", () => {
    const status = (code: LinkError["code"]) => {
      try {
        linkErrorToHttp(new LinkError(code, "x"));
      } catch (error) {
        return (error as HttpError).status;
      }
      return 0;
    };
    expect([status("NOT_FOUND"), status("CONFLICT"), status("EXHAUSTED"), status("INVALID_DESTINATION")]).toEqual([404, 409, 503, 400]);
    expect(() => linkErrorToHttp(new Error("otro"))).toThrow("otro");
  });

  it("If-Match: número entre comillas, ausente, o 400", () => {
    expect(revisionFromIfMatch('"3"')).toBe(3);
    expect(revisionFromIfMatch(null)).toBeUndefined();
    expect(() => revisionFromIfMatch('"abc"')).toThrow(HttpError);
  });

  it("la base pública prefiere el dominio permanente configurado", () => {
    expect(linkBase(" https://qr.palace.com/ ", "https://f.test/qr-enlaces")).toBe("https://qr.palace.com");
    expect(linkBase(undefined, "https://f.test/qr-enlaces/")).toBe("https://f.test/qr-enlaces");
    expect(ownHostsOf("https://qr.palace.com", ["f.test"]).sort()).toEqual(["f.test", "qr.palace.com"]);
  });
});
