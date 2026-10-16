import { AppShell } from "@/components/qr-produccion/layout/AppShell";
import { StepHeader } from "@/components/qr-produccion/layout/StepHeader";
import { PreviewScreen } from "@/components/qr-produccion/editor/PreviewScreen";

export default function Diseno() {
  return (
    <AppShell step={2}>
      <StepHeader step={2} title="Diseña la pieza" description="Mueve el QR y el bloque de texto, o escribe sus medidas. Puedes aplicar el cambio a todas las piezas o solo a la que ves." />
      <PreviewScreen />
    </AppShell>
  );
}
