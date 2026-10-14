import type { ShortLink } from "@/schemas/links";

/**
 * Dónde viven los links cortos. Hoy: archivos de objeto en el storage configurado.
 * Fase B: Postgres de Supabase (misma interfaz; ver specs/011-acortador-de-links/plan.md).
 */
export interface ShortLinkRepository {
  get(code: string): Promise<ShortLink | null>;
  /** Crea el registro SOLO si no existe: nunca sobrescribe. */
  create(link: ShortLink): Promise<"created" | "exists">;
  /**
   * Cambia el destino (el anterior pasa al historial). Devuelve null si el código no existe
   * y lanza `RevisionConflictError` si el registro cambió desde `expectedRevision`.
   */
  updateDestination(code: string, destination: string, at: string, expectedRevision?: number): Promise<ShortLink | null>;
}

export class RevisionConflictError extends Error {
  constructor() {
    super("El link cambió mientras lo editabas");
    this.name = "RevisionConflictError";
  }
}
