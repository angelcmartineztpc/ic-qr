import { describe, expect, it } from "vitest";

import { encodeMatrix } from "@/lib/qr/encode";
import { ExternalGeometrySchema } from "@/schemas/qr-geometry";

import { bytes, ownQrSvg, rectQrSvg, strokeQrSvg } from "../../../tests/helpers/qr-svg";
import { sanitizeExternalSvg, SvgRejectedError } from "./sanitize-svg";

const URL_QR = "https://menu.example.com/tropical";
const wrap = (inner: string, attrs = 'viewBox="0 0 10 10"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;

describe("sanitizeExternalSvg — QR legítimos", () => {
  it("nuestro propio SVG: fondo + un path con even-odd", () => {
    const geometry = sanitizeExternalSvg(bytes(ownQrSvg(URL_QR)));
    expect(geometry.viewBox).toEqual([0, 0, 41, 41]);
    expect(geometry.nodes.map((n) => n.type)).toEqual(["rect", "path"]);
    expect(geometry.nodes[1]).toMatchObject({ type: "path", fill: "#000000", fillRule: "evenodd" });
    expect(geometry.strokeBased).toBe(false);
  });

  it("estilo por trazos (generadores habituales): se marca strokeBased", () => {
    const geometry = sanitizeExternalSvg(bytes(strokeQrSvg(encodeMatrix(URL_QR))));
    expect(geometry.strokeBased).toBe(true);
    expect(geometry.nodes.some((n) => n.type === "path" && n.stroke === "#000000")).toBe(true);
  });

  it("estilo un rect por módulo, con fill heredado del grupo, color corto, nombre y declaración XML", () => {
    const geometry = sanitizeExternalSvg(bytes(rectQrSvg(encodeMatrix(URL_QR))));
    const rects = geometry.nodes.filter((n) => n.type === "rect");
    expect(rects[0]).toMatchObject({ fill: "#FFFFFF" });
    expect(rects.slice(1).every((r) => r.type === "rect" && r.fill === "#000000")).toBe(true);
  });

  it("hereda y compone transformaciones y estilos", () => {
    const geometry = sanitizeExternalSvg(bytes(wrap('<g transform="translate(2 3)" fill="red-no"><path d="M0 0h1v1H0z"/></g>'.replace("red-no", "#f00"))));
    expect(geometry.nodes[0]).toMatchObject({ fill: "#FF0000", transform: [1, 0, 0, 1, 2, 3] });
    const nested = sanitizeExternalSvg(bytes(wrap('<g transform="scale(2)"><g transform="translate(1 1)"><rect width="1" height="1"/></g></g>')));
    expect(nested.nodes[0]).toMatchObject({ transform: [2, 0, 0, 2, 2, 2] });
  });

  it("acepta style con fill/fill-rule, polygon, rgb() y viewBox derivado de width/height", () => {
    const geometry = sanitizeExternalSvg(bytes('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><polygon points="0,0 4,0 4,4" style="fill:rgb(0,0,0);fill-rule:evenodd"/></svg>'));
    expect(geometry.viewBox).toEqual([0, 0, 20, 20]);
    expect(geometry.nodes[0]).toMatchObject({ type: "path", d: "M0 0L4 0L4 4Z", fill: "#000000", fillRule: "evenodd" });
  });

  it("ignora title, desc y metadata; el resultado cumple el schema", () => {
    const geometry = sanitizeExternalSvg(bytes(wrap('<title>QR</title><desc>x</desc><metadata/><defs/><path d="M0 0h2v2H0z"/>')));
    expect(ExternalGeometrySchema.safeParse(geometry).success).toBe(true);
    expect(geometry.nodes).toHaveLength(1);
  });
});

const HOSTILE: Array<[string, string | Uint8Array]> = [
  ["script", wrap('<script>alert(1)</script><path d="M0 0h1v1H0z"/>')],
  ["atributo onload", wrap('<path d="M0 0h1v1H0z" onload="alert(1)"/>')],
  ["atributo de evento en el svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onclick="x()"><path d="M0 0h1v1H0z"/></svg>'],
  ["foreignObject", wrap('<foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>')],
  ["image externa", wrap('<image href="https://evil.example/x.png" width="10" height="10"/>')],
  ["use con href", wrap('<use href="https://evil.example/x.svg#a"/>')],
  ["use con xlink:href", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1"><use xlink:href="#a"/></svg>'],
  ["enlace a", wrap('<a href="javascript:alert(1)"><path d="M0 0h1v1H0z"/></a>')],
  ["style element", wrap('<style>path{fill:url(https://evil.example/x)}</style><path d="M0 0h1v1H0z"/>')],
  ["style con url()", wrap('<path d="M0 0h1v1H0z" style="fill:url(https://evil.example/x)"/>')],
  ["relleno con degradado", wrap('<path d="M0 0h1v1H0z" fill="url(#g)"/>')],
  ["javascript: en un atributo", wrap('<path d="M0 0h1v1H0z" fill="javascript:alert(1)"/>')],
  ["animate", wrap('<path d="M0 0h1v1H0z"><animate attributeName="fill" to="red"/></path>')],
  ["XXE con DOCTYPE y ENTITY", '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>&xxe;</title><path d="M0 0h1v1H0z"/></svg>'],
  ["billion laughs", '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>&lol2;</title><path d="M0 0h1v1H0z"/></svg>'],
  ["instrucción de procesamiento", '<?xml-stylesheet href="https://evil.example/x.css"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>'],
  ["tamaño desproporcionado (100000mm)", '<svg xmlns="http://www.w3.org/2000/svg" width="100000mm" height="100000mm"><path d="M0 0h1v1H0z"/></svg>'],
  ["viewBox gigante", wrap('<path d="M0 0h1v1H0z"/>', 'viewBox="0 0 99999 99999"')],
  ["sin tamaño", '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>'],
  ["d con comandos no válidos", wrap('<path d="M0 0 script(alert) z"/>')],
  ["d gigante (> 500 KB)", wrap(`<path d="${"M0 0h1v1H0z".repeat(50_000)}"/>`)],
  ["demasiados números", wrap(`<path d="M0 0${"L1 1".repeat(110_000)}"/>`)],
  ["XML mal formado", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"></svg>'],
  ["no es un SVG", "<html><body>hola</body></html>"],
  ["raíz distinta", '<div xmlns="http://www.w3.org/1999/xhtml">x</div>'],
  ["sin geometría visible", wrap('<path d="M0 0h1v1H0z" fill="none"/>')],
  ["UTF-8 inválido", new Uint8Array([0x3c, 0x73, 0x76, 0x67, 0xff, 0xfe, 0x3e])],
  ["transformación no admitida", wrap('<path d="M0 0h1v1H0z" transform="perspective(10)"/>')],
  ["más de 512 KiB", new Uint8Array(600 * 1024).fill(0x20)],
];

describe("sanitizeExternalSvg — SVG hostiles (spec §31)", () => {
  it.each(HOSTILE)("rechaza: %s", (_name, input) => {
    expect(() => sanitizeExternalSvg(typeof input === "string" ? bytes(input) : input)).toThrow(SvgRejectedError);
  });

  it("limita el número de elementos", () => {
    const many = wrap('<rect width="1" height="1"/>'.repeat(5001));
    expect(() => sanitizeExternalSvg(bytes(many))).toThrow(/demasiados elementos/);
  });

  it("la salida nunca conserva scripts ni referencias: es solo geometría", () => {
    const geometry = sanitizeExternalSvg(bytes(wrap('<title>x</title><path d="M0 0h1v1H0z"/>')));
    expect(JSON.stringify(geometry)).not.toMatch(/script|href|http|on[a-z]+=/i);
  });
});
