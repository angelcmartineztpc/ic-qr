import type { NextRequest } from "next/server";
import { ZipArchive } from "archiver";
import { buildServiceUrl, getProperty, PropertyError, type Service, type SpotType } from "@/data/properties";
import { generateLabel, LabelError } from "@/lib/label";

const MAX_SPOTS = 500;

type ExportCode = "INVALID_INPUT" | "PROPERTY_NOT_FOUND" | "LIMIT_EXCEEDED" | "INTERNAL";

class ExportError extends Error {
  constructor(public code: ExportCode, message: string) {
    super(message);
  }
}

const STATUS: Record<ExportCode, number> = {
  INVALID_INPUT: 400,
  LIMIT_EXCEEDED: 400,
  PROPERTY_NOT_FOUND: 404,
  INTERNAL: 500,
};

const isInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;

function parse(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const { propertyId, stationName, spotType, startNumber, endNumber, service } = b;
  if (typeof propertyId !== "string" || !propertyId) throw new ExportError("INVALID_INPUT", "propertyId required");
  if (typeof stationName !== "string" || !stationName.trim()) throw new ExportError("INVALID_INPUT", "stationName required");
  if (spotType !== "mesa" && spotType !== "camastro") throw new ExportError("INVALID_INPUT", "spotType must be mesa|camastro");
  if (service !== "pool" && service !== "restaurant") throw new ExportError("INVALID_INPUT", "service must be pool|restaurant");
  if (!isInt(startNumber) || !isInt(endNumber)) throw new ExportError("INVALID_INPUT", "startNumber/endNumber must be integers >= 1");
  if (startNumber > endNumber) throw new ExportError("INVALID_INPUT", "startNumber must be <= endNumber");
  if (endNumber - startNumber + 1 > MAX_SPOTS) throw new ExportError("LIMIT_EXCEEDED", `Max ${MAX_SPOTS} spots`);
  return { propertyId, stationName, spotType: spotType as SpotType, startNumber, endNumber, service: service as Service };
}

async function zip(files: { name: string; data: string }[]): Promise<Buffer> {
  const archive = new ZipArchive();
  const chunks: Buffer[] = [];
  archive.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res, rej) => {
    archive.on("error", rej);
    archive.on("end", res);
  });
  for (const f of files) archive.append(f.data, { name: f.name });
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ExportError("INVALID_INPUT", "Invalid JSON body");
    }
    const i = parse(body);
    let url: string;
    try {
      url = buildServiceUrl(getProperty(i.propertyId), i.service);
    } catch (e) {
      if (e instanceof PropertyError) throw new ExportError("PROPERTY_NOT_FOUND", e.message);
      throw e;
    }
    const pad = String(i.endNumber).length;
    const prefix = i.spotType === "mesa" ? "M" : "C";
    const files: { name: string; data: string }[] = [];
    for (let n = i.startNumber; n <= i.endNumber; n++) {
      files.push({
        name: `${prefix}${String(n).padStart(pad, "0")}.svg`,
        data: await generateLabel({ stationName: i.stationName, spotType: i.spotType, number: n, service: i.service, url }),
      });
    }
    const buf = await zip(files);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${i.propertyId}-${i.spotType}-${i.service}.zip"`,
      },
    });
  } catch (e) {
    if (e instanceof ExportError) return Response.json({ error: e.message, code: e.code }, { status: STATUS[e.code] });
    if (e instanceof LabelError) return Response.json({ error: e.message, code: "INVALID_INPUT" }, { status: 400 });
    return Response.json({ error: "Internal error", code: "INTERNAL" }, { status: 500 });
  }
}
