import type { Metadata } from "next";

import { EditorScreen } from "@/components/records/EditorScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Piezas" };

export default function EditorPage() {
  return (
    <AppShell step={0}>
      <StepHeader
        step={0}
        title="Tus piezas"
        description="Revisa el arte de cada placa, edita sus textos o importa un lote desde Excel. El estilo y la composición ya vienen listos para imprenta: puedes personalizarlos o saltar directo a exportar."
      />
      <EditorScreen />
    </AppShell>
  );
}
