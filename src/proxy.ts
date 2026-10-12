import { readFileSync } from "node:fs";

import { NextResponse, type NextRequest } from "next/server";

import { parseEnv, type Env } from "./server/config/env-schema";
import { authenticate, BASIC_REALM, type AuthConfig } from "./server/http/auth";

/**
 * Autenticación de páginas. Las rutas /api/* no pasan por aquí: usan
 * withApiGuards, que además comprueba Host, CSRF, límites y cuerpo.
 */
let authConfig: AuthConfig | undefined;

function getAuthConfig(): AuthConfig {
  if (!authConfig) {
    const env: Env = parseEnv(process.env, (path) => readFileSync(path, "utf8"));
    authConfig = {
      mode: env.AUTH_MODE,
      basicUser: env.BASIC_AUTH_USER,
      basicPasswordSha256: env.BASIC_AUTH_PASSWORD_SHA256,
      proxySecret: env.PROXY_SHARED_SECRET,
    };
  }
  return authConfig;
}

export function proxy(request: NextRequest) {
  const result = authenticate(request.headers, getAuthConfig());
  if (result.ok) return NextResponse.next();
  return new NextResponse("Autenticación requerida", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      ...(result.challenge ? { "WWW-Authenticate": BASIC_REALM } : {}),
    },
  });
}

export const config = {
  matcher: ["/((?!api/|_next/static/|_next/image/|favicon\\.ico$|robots\\.txt$).*)"],
};
