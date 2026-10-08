import type { Metadata } from "next";

import { PreviewScreen } from "@/components/editor/PreviewScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Diseño" };

export default function PreviewPage() {
  return (
    <AppShell step={1}>
      <StepHeader step={1} title="Diseña la pieza" description="Mueve el QR y el bloque de texto, o escribe sus medidas. Puedes aplicar el cambio a todas las piezas o solo a la que ves." />
      <PreviewScreen />
    </AppShell>
  );
}
