import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP sin nonce (ADR: un nonce obligaría a renderizar cada página de forma
 * dinámica desde proxy.ts). Emotion necesita 'unsafe-inline' en style-src.
 * En desarrollo se añaden 'unsafe-eval' y ws: para React Refresh / HMR.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  typedRoutes: true,
  poweredByHeader: false,
  // pdfkit y fontkit leen datos de fuentes desde disco en tiempo de ejecución.
  serverExternalPackages: ["pdfkit", "fontkit"],
  // Gotham no se versiona (licencia comercial): scripts/setup-fonts.ts la copia a
  // assets/fonts/gotham y aquí se incluye en la salida standalone.
  outputFileTracingIncludes: {
    "/api/export": ["./assets/fonts/**/*"],
    "/api/preview/**": ["./assets/fonts/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cross-Origin-Resource-Policy", value: "same-origin" }] },
      // /api/storage/** sirve archivos inmutables con su propio Cache-Control.
      { source: "/api/:path((?!storage/).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
