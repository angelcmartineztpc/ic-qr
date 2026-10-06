import type { NextRequest } from "next/server";
import { generateQR, QRError } from "@/lib/qr-generator";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return Response.json({ error: "Missing url" }, { status: 400 });
  try {
    const svg = await generateQR(url);
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
  } catch (e) {
    if (e instanceof QRError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
