import { describe, expect, it } from "vitest";

import { sanitizeLogo } from "./logo";

const svg = (body: string, attrs = 'viewBox="0 0 100 50"') => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`);

describe("sanitizeLogo", () => {
  it("acepta paths y rectángulos con relleno y devuelve solo geometría", () => {
    const outcome = sanitizeLogo(svg('<path d="M0 0L100 0L100 50Z" fill="#274C69"/><rect x="10" y="10" width="20" height="10" fill="#fff"/>'));
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;
    expect(outcome.geometry.viewBox).toEqual([0, 0, 100, 50]);
    expect(outcome.geometry.nodes).toHaveLength(2);
    expect(outcome.geometry.nodes[0]).toMatchObject({ type: "path", fill: "#274C69" });
    expect(outcome.geometry.nodes[1]).toMatchObject({ type: "rect", fill: "#FFFFFF" });
  });

  it("descarta el trazo de los elementos con relleno (SVG y PDF muestran lo mismo)", () => {
    const outcome = sanitizeLogo(svg('<path d="M0 0L10 0L10 10Z" fill="#000000" stroke="#FF0000" stroke-width="2"/>'));
    expect(outcome.ok && outcome.geometry.nodes[0]).not.toHaveProperty("stroke");
  });

  it("rechaza un logo hecho de trazos, con mensaje accionable", () => {
    const outcome = sanitizeLogo(svg('<path d="M0 0L10 10" fill="none" stroke="#000000" stroke-width="2"/>'));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.message).toMatch(/contornos/);
  });

  it("rechaza scripts, imágenes incrustadas y elementos fuera de la lista blanca", () => {
    for (const body of ["<script>alert(1)</script>", '<image href="data:image/png;base64,AAAA"/>', '<circle cx="5" cy="5" r="5"/>', '<path d="M0 0L1 1" fill="#000" onclick="x()"/>']) {
      expect(sanitizeLogo(svg(body)).ok).toBe(false);
    }
  });

  it("rechaza lo que no es SVG, está vacío o trae DOCTYPE/entidades", () => {
    expect(sanitizeLogo(new TextEncoder().encode("hola")).ok).toBe(false);
    expect(sanitizeLogo(new TextEncoder().encode('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')).ok).toBe(false);
  });

  it("rechaza un logo demasiado detallado para viajar en cada petición", () => {
    const d = `M0 0${"L1 1L2 0".repeat(9000)}Z`;
    const outcome = sanitizeLogo(svg(`<path d="${d}" fill="#000000"/>`));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.message).toMatch(/detallado/);
  });
});
