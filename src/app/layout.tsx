import type { Metadata } from "next";
import localFont from "next/font/local";

import { AppProviders } from "./_providers/AppProviders";
import "./globals.css";

/**
 * Tipografía de la INTERFAZ: Gotham (decisión del 2026-10-07). Las piezas ya no
 * la usan: su tipografía es la de la referencia. Los .woff2 no se versionan
 * (licencia comercial): `bun run fonts:setup` los copia a assets/fonts/gotham
 * antes de compilar. OJO: next/font los publica en /_next/static, o sea que la
 * licencia debe cubrir uso web.
 */
const uiFont = localFont({
  src: [
    { path: "../../assets/fonts/gotham/Gotham-Book.woff2", weight: "400", style: "normal" },
    { path: "../../assets/fonts/gotham/Gotham-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../assets/fonts/gotham/Gotham-Bold.woff2", weight: "700", style: "normal" },
    { path: "../../assets/fonts/gotham/Gotham-Black.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-ui",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: { default: "QR Production Generator", template: "%s · QR Production Generator" },
  description: "Generación de piezas con QR vectorial para fabricación.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={uiFont.variable}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
