/**
 * Edge Functions REALES en el runtime de Supabase local (Deno): requiere `supabase start` y
 * `supabase functions serve --env-file supabase/.env` (con `bun run build:functions` hecho).
 * Ejecutar: `bun run test:db`. Sin las variables de `supabase status -o env`, se omite.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { functionUrl } from "@/services/qr-produccion/app/api-client";
import { uploadExcel } from "@/services/qr-produccion/app/import-client";
import { buildExportRequest } from "@/services/qr-produccion/export/build-request";
import { runExportJob } from "@/services/qr-produccion/export/client";
import { createRecord } from "@/services/qr-produccion/records/factory";
import { createEmptyProject } from "@/services/qr-produccion/state/project";
import { draft, NOW } from "@/services/qr-produccion/test-helpers/records";
import { buildXlsx, HEADER, menuRow } from "@/services/qr-produccion/test-helpers/xlsx-fixtures";
import type { ProjectState, QRRecord, QrResolution } from "@/types";

const API = process.env["API_URL"];
const ANON = process.env["ANON_KEY"];
const SERVICE = process.env["SERVICE_ROLE_KEY"];
const FONT = join(import.meta.dirname, "../../../assets/fonts/address-sans/AddressSansPro-CdSemibold.woff2");
const enabled = Boolean(API && ANON && SERVICE);
const password = "Prueba-local-123!";
const tag = Date.now();

const run = enabled ? describe : describe.skip;

run("Edge Functions en Supabase local", () => {
  let admin: SupabaseClient;
  let token = "";
  let tokenSinRol = "";
  let fontsOk = false;

  const call = (name: string, path = "", init: RequestInit & { jwt?: string | null } = {}) => {
    const { jwt = token, ...rest } = init;
    return fetch(functionUrl(name, path), { ...rest, redirect: "manual", headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(rest.headers as object) } });
  };
  const authed: typeof fetch = (input, init) => fetch(input, { ...init, headers: { ...(init?.headers as object), Authorization: `Bearer ${token}` } });
  const post = (name: string, body: unknown, path = "") => call(name, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  beforeAll(async () => {
    admin = createClient(API!, SERVICE!, { auth: { persistSession: false } });
    const signIn = async (label: string, role: string | null) => {
      const email = `${label}-${tag}@qr.test`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      if (role) await admin.from("user_roles").insert({ user_id: created.data.user.id, role });
      const client = createClient(API!, ANON!, { auth: { persistSession: false } });
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session.access_token;
    };
    token = await signIn("fn-prod", "QR Producción");
    tokenSinRol = await signIn("fn-sin", null);
    try {
      const bytes = await readFile(FONT);
      const up = await admin.storage.from("qr-fuentes").upload("address-sans/AddressSansPro-CdSemibold.woff2", bytes, { upsert: true, contentType: "font/woff2" });
      fontsOk = !up.error;
    } catch {
      fontsOk = false; // la tipografía comercial no se versiona: sin ella se omite lo que la necesita
    }
  }, 60_000);

  describe("acceso", () => {
    it("sin sesión → 401 y con sesión pero sin rol → 403", async () => {
      expect((await post("qr-resolver", { items: [] }, "")).status).toBe(400); // con JWT y rol: llega a validar
      expect((await call("qr-resolver", "", { method: "POST", jwt: null, headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(401);
      expect((await call("qr-resolver", "", { method: "POST", jwt: tokenSinRol, headers: { "Content-Type": "application/json" }, body: "{}" })).status).toBe(403);
    });
  });

  describe("acortador y redirect público", () => {
    it("acorta (idempotente) y /s/{código} redirige 302 al destino sin sesión", async () => {
      const url = `https://menu.example.com/carta/${tag}`;
      const first = (await (await post("qr-enlaces", { urls: [url] }, "/shorten")).json()) as { results?: Array<{ shortUrl?: string }> } | Array<{ shortUrl?: string }>;
      const list = Array.isArray(first) ? first : (first.results ?? []);
      const short = list[0]?.shortUrl;
      expect(short).toBeTruthy();
      const again = (await (await post("qr-enlaces", { urls: [url] }, "/shorten")).json()) as typeof first;
      expect((Array.isArray(again) ? again : (again.results ?? []))[0]?.shortUrl).toBe(short);

      const code = new URL(short!).pathname.split("/").pop()!;
      const redirect = await call("qr-enlaces", `/s/${code}`, { jwt: null });
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get("location")).toBe(url);
    });
  });

  describe("qr-resolver", () => {
    it("genera un QR, lo sirve público como SVG y lo reutiliza al repetir", async () => {
      const item = { recordId: "r-gen", menuUrl: `https://menu.example.com/t/${tag}`, expectedRevision: 0 };
      const first = (await (await post("qr-resolver", { items: [item] })).json()) as { results: QrResolution[]; created: number; reused: number };
      expect(first.created).toBe(1);
      const res = first.results[0]!;
      expect(res.outcome).toBe("generated");
      if (res.outcome !== "generated") return;
      const svg = await fetch(res.qrUrl, { redirect: "manual" }); // público: sin Authorization
      expect(svg.status).toBe(200);
      expect(svg.headers.get("content-type")).toContain("image/svg+xml");
      expect(await svg.text()).toContain("<svg");

      const second = (await (await post("qr-resolver", { items: [item] })).json()) as { created: number; reused: number };
      expect(second.created).toBe(0);
      expect(second.reused).toBe(1);
    }, 30_000);

    it("SSRF: no verifica un QR externo que apunta a la red interna", async () => {
      const response = await post("qr-resolver", { verify: [{ recordId: "r-ssrf", qrUrl: "http://127.0.0.1:54322/x.svg", menuUrl: "https://menu.example.com/a" }] });
      const body = (await response.json()) as { results?: QrResolution[] };
      expect(body.results?.[0]?.outcome).toBe("failed");
    });
  });

  describe("qr-logo", () => {
    it("sanea un SVG y devuelve su geometría; rechaza scripts", async () => {
      const good = await call("qr-logo", "", { method: "POST", headers: { "Content-Type": "image/svg+xml" }, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' });
      expect(good.status).toBe(200);
      const bad = await call("qr-logo", "", { method: "POST", headers: { "Content-Type": "image/svg+xml" }, body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>' });
      expect(bad.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("qr-estable", () => {
    it("un resort/servicio inexistente da 404 sin sesión", async () => {
      expect((await call("qr-estable", "/qr/no-existe/nada", { jwt: null })).status).toBe(404);
    });
  });


  describe("qr-importar-excel (SheetJS desde https en Deno)", () => {
    const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const upload = (body: BodyInit, name = "menus.xlsx", type = XLSX_MIME) => call("qr-importar-excel", "", { method: "POST", headers: { "Content-Type": type, "X-File-Name": encodeURIComponent(name) }, body });

    it("importa un .xlsx real: filas válidas y la fila con error con su motivo", async () => {
      const file = buildXlsx([{ name: "Menús", rows: [HEADER, menuRow("Tropical", "M1", { menu: "https://menu.example.com/a" }), menuRow("Tropical", "M2", { menu: "https://menu.example.com/b" }), menuRow("Tropical", "M3", { menu: "no-es-url" })] }]);
      // El cliente real valida la respuesta con el esquema completo (ImportResponseSchema).
      const result = await uploadExcel(new File([file], "menus.xlsx", { type: XLSX_MIME }), {}, undefined, authed);
      expect(result.totalRows).toBe(3);
      expect(result.successful).toHaveLength(2);
      expect(result.rejected).toHaveLength(1); // «no-es-url»
    }, 30_000);

    it("rechaza un archivo que no es un libro de Excel", async () => {
      const response = await upload(new Uint8Array(2048).fill(7), "falso.xlsx");
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("qr-vista-previa (fontkit: texto a contornos)", () => {
    it("dibuja una pieza como SVG con el texto convertido en contornos", async () => {
      if (!fontsOk) return console.warn("Sin tipografía: se omite");
      const project = createEmptyProject(NOW);
      const response = await post("qr-vista-previa", {
        templateId: project.templateId,
        templateOverrides: project.templateOverrides,
        layout: project.layout,
        detail: "full",
        tiles: [{ key: "k1", recordId: "p1", area: "Tropical", estacion: "Bar", mesa: "M1", subgrupo: "", concepto: "", menuUrl: "https://menu.example.com/p", qr: { source: "none" } }],
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { tiles: Record<string, { svg: string }> };
      expect(body.tiles["k1"]?.svg).toContain("<svg");
      expect(body.tiles["k1"]?.svg).not.toContain("<text"); // la tipografía comercial nunca sale del servidor
    }, 30_000);
  });

  /** Genera de verdad los QR (por lotes de 50, el máximo del servidor) y devuelve el proyecto listo para exportar. */
  async function projectWithQrs(count: number): Promise<ProjectState> {
    const records: QRRecord[] = Array.from({ length: count }, (_, i) => createRecord(draft({ mesa: `M${i + 1}`, menuUrl: `https://menu.example.com/e/${tag}/${i}` }), { now: NOW, order: i, origin: "manual", id: `e${i}` }));
    for (let at = 0; at < records.length; at += 50) {
      const chunk = records.slice(at, at + 50);
      const response = await post("qr-resolver", { items: chunk.map((r) => ({ recordId: r.id, menuUrl: r.menuUrl, expectedRevision: createEmptyProject(NOW).revision })) });
      if (!response.ok) throw new Error(`resolver ${response.status}: ${await response.text()}`);
      const body = (await response.json()) as { results: QrResolution[] };
      for (const result of body.results) {
        const record = records.find((r) => r.id === result.recordId)!;
        if (result.outcome === "generated" || result.outcome === "reused") Object.assign(record, { qrStatus: "generated", qr: result.qr, qrUrl: result.qrUrl });
        else throw new Error(`QR no generado para ${record.id}: ${JSON.stringify(result)}`);
      }
    }
    const project = createEmptyProject(NOW);
    return { ...project, recordsById: Object.fromEntries(records.map((r) => [r.id, r])), order: records.map((r) => r.id) };
  }

  const exportOf = (project: ProjectState, formats: Array<"pdf" | "svgZip">) => {
    const built = buildExportRequest({ ...project, exportOptions: { ...project.exportOptions, formats } }, [], new Date(NOW));
    expect(built.blocked).toEqual([]);
    return built.request;
  };

  describe("qr-exportar (pdfkit + fontkit en Deno)", () => {
    it("3 piezas → PDF vectorial válido y ZIP de SVG", async () => {
      if (!fontsOk) return console.warn("Sin tipografía en assets/fonts: se omite la exportación");
      const project = await projectWithQrs(3);
      const result = await runExportJob(exportOf(project, ["pdf", "svgZip"]), {}, undefined, authed);
      const pdf = new Uint8Array(await result.files.pdf!.blob.arrayBuffer());
      expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(1000);
      const zip = new Uint8Array(await result.files.zip!.blob.arrayBuffer());
      expect([zip[0], zip[1]]).toEqual([0x50, 0x4b]);
    }, 60_000);

    it("100 piezas en UNA llamada: mide el techo de CPU/memoria de la Edge Function", async () => {
      if (!fontsOk) return console.warn("Sin tipografía: se omite");
      const project = await projectWithQrs(100);
      const started = performance.now();
      const result = await runExportJob(exportOf(project, ["pdf"]), {}, undefined, authed);
      const ms = Math.round(performance.now() - started);
      console.warn(`[medida] exportar 100 piezas (PDF) en la Edge Function local: ${ms} ms, ${result.files.pdf!.blob.size} bytes`);
      expect(result.files.pdf!.blob.size).toBeGreaterThan(10_000);
    }, 180_000);
  });
});
