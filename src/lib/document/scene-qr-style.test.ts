import { describe, expect, it } from "vitest";

import { encodeMatrix } from "@/lib/qr/encode";
import { renderSceneSvg } from "@/lib/svg/render-scene";
import { DEFAULT_QR_STYLE, type QrStyle } from "@/schemas/qr-style";
import type { QrGeometry } from "@/types";

import { fakeFonts } from "../../../tests/helpers/fake-font";
import { legacyTile } from "../../../tests/helpers/legacy-tile";
import { buildScene } from "./scene";

const matrix = encodeMatrix("https://menu.example.com/tropical");
const qr: QrGeometry = { kind: "matrix", matrix, modules: matrix.length };
const external: QrGeometry = { kind: "external", viewBox: [0, 0, 10, 10], nodes: [{ type: "rect", x: 0, y: 0, w: 10, h: 10, fill: "#000000" }], strokeBased: false };
const record = { id: "r1", area: "A", estacion: "E", mesa: "M", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/tropical" };
const style = (patch: Partial<QrStyle>): QrStyle => ({ ...structuredClone(DEFAULT_QR_STYLE), ...patch });
const LOGO = {
  geometry: { viewBox: [0, 0, 200, 100] as [number, number, number, number], nodes: [{ type: "rect" as const, x: 0, y: 0, w: 200, h: 100, fill: "#112233" as const }] },
  sizePct: 20,
  marginModules: 1,
  color: null,
  fileName: "wide.svg",
};

const build = (qrStyle?: QrStyle, geometry: QrGeometry = qr) => {
  const template = legacyTile();
  return buildScene({ template, layout: template.defaultLayout, record, qr: geometry, fonts: fakeFonts, ...(qrStyle ? { qrStyle } : {}) });
};
const ids = (scene: ReturnType<typeof build>) => scene.nodes.filter((n) => n.layer === "qr").map((n) => n.id);

describe("buildScene con estilo del QR", () => {
  it("sin estilo (o con el estilo clásico) la escena es idéntica a la de siempre", () => {
    expect(build(structuredClone(DEFAULT_QR_STYLE))).toEqual(build());
    expect(ids(build())).toEqual(["qr-background", "qr-code"]);
  });

  it("con estilo dibuja fondo, módulos, marcos y pupilas, cada uno con su color", () => {
    const scene = build(style({ modules: "dots", colors: { modules: "#112233", eyeFrame: "#AA0000", eyeBall: null, background: "#FFFFEE" } }));
    expect(ids(scene)).toEqual(["qr-background", "qr-code", "qr-eye-frame", "qr-eye-ball"]);
    const fill = (id: string) => scene.nodes.find((n) => n.id === id && "fill" in n && n.fill && "rgb" in n.fill && n.fill)?.["fill" as never];
    expect(fill("qr-background")).toMatchObject({ rgb: "#FFFFEE" });
    expect(fill("qr-code")).toMatchObject({ rgb: "#112233" });
    expect(fill("qr-eye-frame")).toMatchObject({ rgb: "#AA0000" });
    expect(fill("qr-eye-ball")).toMatchObject({ rgb: "#AA0000" }); // hereda del marco
  });

  it("los ids siguen siendo únicos", () => {
    const all = build(style({ modules: "rounded", logo: LOGO })).nodes.map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it("contorno circular: el fondo es un círculo y los módulos se reducen para caber dentro", () => {
    const square = build(style({ modules: "rounded" }));
    const round = build(style({ outline: "circle" }));
    const background = round.nodes.find((n) => n.id === "qr-background");
    expect(background?.type).toBe("rect");
    if (background?.type === "rect") expect(background.r).toBeCloseTo(background.w / 2);
    expect(square.nodes.find((n) => n.id === "qr-background")).not.toHaveProperty("r");
    const area = (scene: ReturnType<typeof build>) => scene.nodes.find((n) => n.id === "qr-eye-ball");
    expect(area(round)).toBeDefined();
  });

  it("el logo se centra en la caja del QR conservando su proporción", () => {
    const scene = build(style({ logo: LOGO }));
    const logo = scene.nodes.find((n) => n.id === "qr-logo");
    const box = scene.nodes.find((n) => n.id === "qr-background");
    expect(logo?.type).toBe("qrExternal");
    if (logo?.type !== "qrExternal" || box?.type !== "rect") throw new Error("faltan nodos");
    const scale = logo.box.width / 200;
    const drawnW = 200 * scale;
    const drawnH = 100 * scale;
    expect(logo.box.x + drawnW / 2).toBeCloseTo(box.x + box.w / 2, 2);
    expect(logo.box.y + drawnH / 2).toBeCloseTo(box.y + box.h / 2, 2);
    expect(drawnW).toBeGreaterThan(drawnH);
  });

  it("el color del logo se aplica a toda su geometría", () => {
    const logo = build(style({ logo: { ...LOGO, color: "#FF0000" } })).nodes.find((n) => n.id === "qr-logo");
    expect(logo?.type === "qrExternal" && logo.geometry.nodes[0]).toMatchObject({ fill: "#FF0000" });
  });

  it("un QR existente (Link del QR) se dibuja tal cual: el estilo no le aplica", () => {
    const plain = build(undefined, external);
    const styled = build(style({ modules: "dots", outline: "circle", logo: LOGO, colors: { modules: "#FF0000", eyeFrame: null, eyeBall: null, background: "#00FF00" } }), external);
    expect(styled).toEqual(plain);
    expect(ids(styled)).toEqual(["qr-background", "qr-code"]);
  });

  it("avisa cuando el estilo deja el QR sin contraste", () => {
    const scene = build(style({ colors: { modules: "#EEEEEE", eyeFrame: null, eyeBall: null, background: null } }));
    expect(scene.warnings).toContainEqual(expect.objectContaining({ code: "QR_STYLE_LOW_CONTRAST", level: "block" }));
  });

  it("el SVG por pieza admite los paths con curvas y escala sus coordenadas", () => {
    const svg = renderSceneSvg(build(style({ modules: "extra-rounded", eyeFrame: "circle", eyeBall: "circle" })));
    expect(svg).toContain('id="qr-eye-frame"');
    expect(svg).toMatch(/d="M[^"]*C[^"]*Z"/);
    expect(svg).not.toMatch(/NaN/);
  });
});
