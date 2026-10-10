import type { Metadata } from "next";

import { QrStyleScreen } from "@/components/qr-style/QrStyleScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Estilo del QR" };

export default function QrStylePage() {
  return (
    <AppShell step={1}>
      <StepHeader step={1} title="Dale estilo al QR" description="Elige la forma, los colores y, si quieres, un logo. Cambia solo cómo se dibuja: el contenido del QR no cambia y las piezas con su propio QR lo conservan." />
      <QrStyleScreen />
    </AppShell>
  );
}
