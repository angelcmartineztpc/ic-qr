import { Alert } from "@/components/qr-produccion/ui";

import { PageHeader } from "./PageHeader";

/** Pantalla reservada para una fase del plan que aún no está implementada. */
export function PlannedScreen({ title, description, phase }: { title: string; description: string; phase: string }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Alert severity="info">Esta pantalla se implementa en la {phase}.</Alert>
    </>
  );
}
