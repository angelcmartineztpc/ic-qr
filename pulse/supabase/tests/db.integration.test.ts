/**
 * Pruebas contra Supabase LOCAL REAL (`supabase start`): SQL, RLS con usuarios distintos y el adaptador
 * `supabaseProjectTable` que antes solo se probaba con una tabla simulada.
 * Ejecutar: `bun run test:db` (lee las claves de `supabase status -o env`; sin ellas, se omite).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import { RemoteProjectPersistence, supabaseProjectTable } from "@/services/qr-produccion/state/remote-persistence";
import { addRecord, createEmptyProject } from "@/services/qr-produccion/state/project";
import { draft, NOW } from "@/services/qr-produccion/test-helpers/records";

const URL = process.env["API_URL"];
const ANON = process.env["ANON_KEY"];
const SERVICE = process.env["SERVICE_ROLE_KEY"];
const enabled = Boolean(URL && ANON && SERVICE);

const run = enabled ? describe : describe.skip;
const password = "Prueba-local-123!";
const tag = Date.now();

run("Supabase local: SQL, RLS y adaptador", () => {
  let admin: SupabaseClient;
  const users = {} as Record<"produccion" | "sinRol" | "admin", { id: string; client: SupabaseClient }>;

  const asUser = async (email: string) => {
    const client = createClient(URL!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { id: data.user.id, client };
  };

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
    const make = async (key: keyof typeof users, role: string | null) => {
      const email = `${key}-${tag}@qr.test`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) throw created.error;
      if (role) {
        const inserted = await admin.from("user_roles").insert({ user_id: created.data.user.id, role });
        if (inserted.error) throw inserted.error;
      }
      users[key] = await asUser(email);
    };
    await make("produccion", "QR Producción");
    await make("sinRol", null);
    await make("admin", "Admin");
  }, 60_000);

  const row = (id: string, nombre = "P") => ({ id, nombre, datos: { a: 1 }, schema_version: 2 });

  it("una persona SIN rol no puede crear proyectos (RLS de INSERT)", async () => {
    const { error } = await users.sinRol.client.from("qr_proyectos").insert(row(crypto.randomUUID()));
    expect(error).not.toBeNull();
  });

  it("con rol «QR Producción» crea, y el propietario por defecto es quien crea", async () => {
    const id = crypto.randomUUID();
    const { data, error } = await users.produccion.client.from("qr_proyectos").insert(row(id)).select().single();
    expect(error).toBeNull();
    expect(data?.owner_id).toBe(users.produccion.id);
    expect(data?.revision).toBe(1);
  });

  it("no se puede crear un proyecto a nombre de otra persona", async () => {
    const { error } = await users.produccion.client.from("qr_proyectos").insert({ ...row(crypto.randomUUID()), owner_id: users.admin.id });
    expect(error).not.toBeNull();
  });

  it("el trigger sube la revisión y el UPDATE con revisión vieja no coincide (null, sin error)", async () => {
    const id = crypto.randomUUID();
    await users.produccion.client.from("qr_proyectos").insert(row(id));
    const first = await users.produccion.client.from("qr_proyectos").update({ nombre: "v2" }).eq("id", id).eq("revision", 1).select().maybeSingle();
    expect(first.error).toBeNull();
    expect(first.data?.revision).toBe(2);
    const stale = await users.produccion.client.from("qr_proyectos").update({ nombre: "v3" }).eq("id", id).eq("revision", 1).select().maybeSingle();
    expect(stale.error).toBeNull();
    expect(stale.data).toBeNull();
  });

  it("quien no tiene rol ni es propietario NO ve proyectos ajenos; el equipo de producción sí", async () => {
    const id = crypto.randomUUID();
    await users.admin.client.from("qr_proyectos").insert(row(id, "del admin"));
    const sin = await users.sinRol.client.from("qr_proyectos").select("id").eq("id", id);
    expect(sin.data).toEqual([]);
    const prod = await users.produccion.client.from("qr_proyectos").select("id").eq("id", id);
    expect(prod.data).toHaveLength(1);
  });

  it("solo el propietario o Admin borra; un compañero de producción no", async () => {
    const id = crypto.randomUUID();
    await users.admin.client.from("qr_proyectos").insert(row(id));
    await users.produccion.client.from("qr_proyectos").delete().eq("id", id);
    expect((await admin.from("qr_proyectos").select("id").eq("id", id)).data).toHaveLength(1);
    await users.admin.client.from("qr_proyectos").delete().eq("id", id);
    expect((await admin.from("qr_proyectos").select("id").eq("id", id)).data).toHaveLength(0);
  });

  it("las tablas de catálogo y enlaces no se escriben desde el cliente (solo las funciones, con service role)", async () => {
    const hash = "a".repeat(64);
    const activo = await users.admin.client.from("qr_activos").insert({ content_hash: hash, storage_key: `qr/v1/${hash}.svg` });
    expect(activo.error).not.toBeNull();
    const enlace = await users.admin.client.from("qr_enlaces").insert({ codigo: "abcd1234", destino: "https://x.test" });
    expect(enlace.error).not.toBeNull();
  });

  it("anon no lee nada del módulo", async () => {
    const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    for (const table of ["qr_proyectos", "qr_activos", "qr_enlaces", "qr_resorts"]) {
      const { data } = await anon.from(table).select("*").limit(1);
      expect(data ?? []).toEqual([]);
    }
  });

  it("el catálogo de resorts viene sembrado y lo leen los roles del módulo", async () => {
    const { data, error } = await users.produccion.client.from("qr_resorts").select("*");
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  describe("adaptador supabaseProjectTable + RemoteProjectPersistence contra la base real", () => {
    it("guarda, recarga y detecta un conflicto real entre dos dispositivos", async () => {
      const { client } = users.produccion;
      const projectA = addRecord(createEmptyProject(NOW), draft(), NOW).state;

      const dispositivo1 = new RemoteProjectPersistence(supabaseProjectTable(client), { debounceMs: 5 });
      dispositivo1.schedule(projectA);
      await dispositivo1.flush();
      expect(dispositivo1.status).toBe("saved");
      expect(dispositivo1.revision).toBe(1);

      // «Otro dispositivo» carga el mismo proyecto y guarda primero.
      const dispositivo2 = new RemoteProjectPersistence(supabaseProjectTable(client), { debounceMs: 5 });
      const loaded = await dispositivo2.load(projectA.projectId);
      expect(loaded.kind).toBe("loaded");
      dispositivo2.schedule({ ...projectA, name: "desde el 2", revision: projectA.revision + 1 });
      await dispositivo2.flush();
      expect(dispositivo2.status).toBe("saved");

      // El 1 guarda con una revisión que ya no es la de la base → conflicto, sin pisar.
      dispositivo1.schedule({ ...projectA, name: "desde el 1", revision: projectA.revision + 1 });
      await dispositivo1.flush();
      expect(dispositivo1.status).toBe("conflict");
      const stored = await admin.from("qr_proyectos").select("nombre").eq("id", projectA.projectId).single();
      expect(stored.data?.nombre).toBe("desde el 2");
    });

    it("INSERT de un id repetido se reconoce como «exists» (23505), no como error", async () => {
      const table = supabaseProjectTable(users.produccion.client);
      const id = crypto.randomUUID();
      const first = await table.insert({ ...row(id) });
      expect(first).not.toBe("exists");
      expect(await table.insert({ ...row(id) })).toBe("exists");
    });
  });
});
