/**
 * Autenticación compartida por las guardas de la API y por src/proxy.ts (páginas).
 * Sin `server-only`: proxy.ts no se ejecuta en la capa react-server.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export interface AuthConfig {
  mode: "none" | "basic" | "proxy";
  basicUser?: string | undefined;
  /** SHA-256 hex de la contraseña (nunca la contraseña en claro). */
  basicPasswordSha256?: string | undefined;
  proxySecret?: string | undefined;
}

export type AuthResult = { ok: true; principal: string } | { ok: false; challenge: boolean };

export const BASIC_REALM = 'Basic realm="QR Production Generator", charset="UTF-8"';

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Comparación en tiempo constante; hashea ambos lados para igualar longitudes. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

function parseBasic(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return null;
  return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
}

export function authenticate(headers: Headers, config: AuthConfig): AuthResult {
  switch (config.mode) {
    case "none":
      return { ok: true, principal: "anonymous" };
    case "basic": {
      const credentials = parseBasic(headers.get("authorization"));
      if (!credentials || !config.basicUser || !config.basicPasswordSha256) return { ok: false, challenge: true };
      const userOk = safeEqual(credentials.user, config.basicUser);
      const passwordHex = sha256(credentials.password).toString("hex");
      const passwordOk = safeEqual(passwordHex, config.basicPasswordSha256.toLowerCase());
      return userOk && passwordOk ? { ok: true, principal: `basic:${config.basicUser}` } : { ok: false, challenge: true };
    }
    case "proxy": {
      const provided = headers.get("x-proxy-auth");
      if (!provided || !config.proxySecret || !safeEqual(provided, config.proxySecret)) {
        return { ok: false, challenge: false };
      }
      const user = headers.get("x-forwarded-user")?.trim();
      return { ok: true, principal: user ? `proxy:${user}` : "proxy" };
    }
  }
}
