import { EditorScreen } from "@/components/qr-produccion/records/EditorScreen";
import { AppShell } from "@/components/qr-produccion/layout/AppShell";
import { StepHeader } from "@/components/qr-produccion/layout/StepHeader";

export default function Piezas() {
  return (
    <AppShell step={0}>
      <StepHeader step={0} title="Tus piezas" description="Agrega las piezas una a una o impórtalas desde un Excel o CSV. Cada una lleva su QR; revisa que todo esté bien antes de pasar al diseño." />
      <EditorScreen />
    </AppShell>
  );
}
