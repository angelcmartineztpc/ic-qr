import { isDraining } from "@/server/lifecycle";

/**
 * Health check para Docker / orquestadores. Exento de guardas y sin datos
 * internos (versión, storage…), que van solo al log de arranque.
 */
export function GET() {
  const ok = !isDraining();
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
