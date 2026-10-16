import { AppShell } from "@/components/qr-produccion/layout/AppShell";
import { StepHeader } from "@/components/qr-produccion/layout/StepHeader";
import { QrStyleScreen } from "@/components/qr-produccion/qr-style/QrStyleScreen";

export default function EstiloQr() {
  return (
    <AppShell step={1}>
      <StepHeader step={1} title="Dale estilo al QR" description="Elige la forma, los colores y, si quieres, un logo. Cambia solo cómo se dibuja: el contenido del QR no cambia y las piezas con su propio QR lo conservan." />
      <QrStyleScreen />
    </AppShell>
  );
}
