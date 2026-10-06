import type { Metadata } from "next";

import { EditorScreen } from "@/components/records/EditorScreen";
import { AppShell } from "@/components/ui/AppShell";

export const metadata: Metadata = { title: "Piezas" };

export default function EditorPage() {
  return (
    <AppShell>
      <EditorScreen />
    </AppShell>
  );
}
