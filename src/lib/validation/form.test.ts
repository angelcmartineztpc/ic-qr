import { describe, expect, it } from "vitest";

import { EMPTY_FORM, formValuesOf, validateForm } from "./form";

const VALID = { ...EMPTY_FORM, area: "Tropical", mesa: "M1", menuUrl: "https://menu.example.com/tropical" };

describe("validateForm", () => {
  it("un formulario vacío tiene los tres errores de campos obligatorios y ningún borrador", () => {
    const v = validateForm(EMPTY_FORM);
    expect(v.draft).toBeNull();
    expect(Object.keys(v.errors).sort()).toEqual(["area", "menuUrl", "mesa"]);
    expect(v.errors.menuUrl).toBe("El link del menú es obligatorio");
    expect(v.errors.mesa).toBe("La mesa es obligatoria");
  });

  it("válido: devuelve el borrador normalizado y sin errores", () => {
    const v = validateForm({ ...VALID, area: "  Tropical  ", menuUrl: "HTTPS://Menu.Example.com/tropical" });
    expect(v.errors).toEqual({});
    expect(v.draft).toMatchObject({ area: "Tropical", menuUrl: "https://menu.example.com/tropical" });
  });

  it("los campos son texto libre (R1): cualquier formato de mesa es válido", () => {
    for (const mesa of ["M1", "1", "Terraza 4", "VIP-A", "Mesa #12 (exterior)"]) expect(validateForm({ ...VALID, mesa }).draft).not.toBeNull();
  });

  it("Link del menú inválido y peligroso", () => {
    expect(validateForm({ ...VALID, menuUrl: "hola" }).errors.menuUrl).toBe("El link del menú no es una URL válida");
    expect(validateForm({ ...VALID, menuUrl: "javascript:alert(1)" }).errors.menuUrl).toBeDefined();
  });

  it("Link del QR: opcional; si se escribe debe ser https", () => {
    expect(validateForm({ ...VALID, qrUrl: "" }).draft?.qrUrl).toBeUndefined();
    expect(validateForm({ ...VALID, qrUrl: "https://qr.cliente.com/m1.svg" }).draft?.qrUrl).toBe("https://qr.cliente.com/m1.svg");
    expect(validateForm({ ...VALID, qrUrl: "http://qr.cliente.com/m1.svg" }).errors.qrUrl).toBe("El link del QR no es una URL https válida");
  });

  it("http en el menú es un aviso, no un error", () => {
    const v = validateForm({ ...VALID, menuUrl: "http://menu.example.com/tropical" });
    expect(v.draft).not.toBeNull();
    expect(v.warnings.menuUrl).toMatch(/http/);
  });

  it("avisa de caracteres que la fuente no tiene (no impide guardar)", () => {
    const v = validateForm({ ...VALID, area: "Bar 😀" });
    expect(v.draft).not.toBeNull();
    expect(v.warnings.area).toMatch(/😀/);
    expect(validateForm({ ...VALID, area: "Ñandú · Menú – Terraza" }).warnings.area).toBeUndefined();
  });

  it("textos demasiado largos", () => {
    expect(validateForm({ ...VALID, mesa: "x".repeat(41) }).errors.mesa).toMatch(/supera 40/);
  });

  it("formValuesOf es la inversa del borrador", () => {
    const draft = validateForm(VALID).draft;
    if (!draft) throw new Error("se esperaba un borrador");
    expect(formValuesOf(draft)).toEqual(VALID);
  });
});
