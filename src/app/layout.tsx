import type { Metadata } from "next";
import localFont from "next/font/local";

import { AppProviders } from "./_providers/AppProviders";
import "./globals.css";

/**
 * Tipografía de la interfaz (Roboto, OFL). Gotham es la tipografía de las
 * piezas, pero solo se usa en el servidor: su licencia no cubre servirla al
 * navegador, así que la vista previa recibe el texto ya convertido en contornos.
 * El subconjunto latin cubre español (á é í ó ú ñ ü ¿ ¡) y la raya –.
 */
const uiFont = localFont({
  src: [{ path: "./_fonts/roboto-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "QR Production Generator", template: "%s · QR Production Generator" },
  description: "Generación de piezas de 50 × 50 mm con QR vectorial para fabricación.",
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
