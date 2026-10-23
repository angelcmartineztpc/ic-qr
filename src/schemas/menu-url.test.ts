import { describe, expect, it } from "vitest";

import { isLocalShortLink, MenuUrlSchema } from "./url";

describe("Link del menú con link corto propio en desarrollo", () => {
  it("acepta el link corto de localhost y 127.0.0.1 (sin dominio, en una máquina de desarrollo)", () => {
    expect(MenuUrlSchema.parse("http://localhost:3000/s/ab3de9xk")).toBe("http://localhost:3000/s/ab3de9xk");
    expect(isLocalShortLink("http://127.0.0.1:3100/s/ab3de9xk")).toBe(true);
  });

  it("acepta también el link corto de una IP de red local (app compartida en la oficina)", () => {
    expect(MenuUrlSchema.parse("http://192.168.50.188:3001/s/ab3de9xk")).toBe("http://192.168.50.188:3001/s/ab3de9xk");
    for (const url of ["http://10.0.0.1/s/ab3de9xk", "http://172.16.4.2:3000/s/ab3de9xk"]) expect(isLocalShortLink(url), url).toBe(true);
  });

  it("la excepción es solo esa forma exacta: ni otra ruta, ni parámetros, ni credenciales, ni otros hosts", () => {
    for (const url of ["http://localhost:3000/", "http://localhost:3000/carta", "http://localhost:3000/s/ab3de9xk?x=1", "http://user:pw@localhost:3000/s/ab3de9xk", "http://8.8.8.8:3000/s/ab3de9xk", "http://172.32.0.1/s/ab3de9xk", "http://192.168.1.5:3000/carta", "http://localhost:3000/s/AB3DE9XK0", "ftp://localhost/s/ab3de9xk"]) {
      expect(isLocalShortLink(url), url).toBe(false);
      expect(MenuUrlSchema.safeParse(url).success, url).toBe(false);
    }
  });

  it("todo lo demás sigue como antes: http(s) con dominio y el mismo mensaje de error", () => {
    expect(MenuUrlSchema.parse("https://menu.example.com/carta")).toBe("https://menu.example.com/carta");
    const bad = MenuUrlSchema.safeParse("esto-no-es-un-link");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Debe ser una URL http(s) válida con dominio");
    expect(MenuUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(MenuUrlSchema.safeParse("http://localhost:3000/menu").success).toBe(false);
  });
});
