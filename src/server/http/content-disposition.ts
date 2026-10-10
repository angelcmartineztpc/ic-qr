/** Content-Disposition de descarga con nombre ASCII de respaldo y filename* UTF-8 (RFC 6266). */
export function attachment(fileName: string): string {
  const fallback = fileName.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "_") || "download";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(fileName)}`;
}

/** encodeURIComponent no codifica ' ( ) *, que RFC 5987 no permite en attr-char. */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
