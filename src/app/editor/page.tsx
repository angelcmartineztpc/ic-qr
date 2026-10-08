import type { Metadata } from "next";

import { EditorScreen } from "@/components/records/EditorScreen";
import { AppShell } from "@/components/ui/AppShell";
import { StepHeader } from "@/components/ui/StepHeader";

export const metadata: Metadata = { title: "Piezas" };

export default function EditorPage() {
  return (
    <AppShell step={0}>
      <StepHeader step={0} title="Tus piezas" description="Agrega las piezas una a una o impórtalas desde un Excel o CSV. Cada una lleva su QR; revisa que todo esté bien antes de pasar al diseño." />
      <EditorScreen />
    </AppShell>
  );
}
