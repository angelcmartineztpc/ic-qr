import { getPropertyByCode, isService, PropertyError } from "@/data/properties";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ resortCode: string; service: string }> },
) {
  const { resortCode, service } = await params;
  try {
    if (!isService(service)) throw new PropertyError(`Unknown service: ${service}`);
    const dest = getPropertyByCode(resortCode).serviceUrls[service];
    return new Response(null, { status: 302, headers: { Location: dest, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof PropertyError) return Response.json({ error: e.message }, { status: 404 });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
