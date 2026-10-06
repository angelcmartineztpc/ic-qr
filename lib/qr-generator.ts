import QRCode from "qrcode";

export class QRError extends Error {}

export async function generateQR(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new QRError("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new QRError("URL must be http(s)");
  }
  return QRCode.toString(url, { type: "svg" });
}
