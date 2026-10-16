import { Chip } from "@/components/qr-produccion/ui";

import { useSession } from "@/services/qr-produccion/state/StoreProvider";
import { isGenerating } from "@/services/qr-produccion/state/stores";

import { phaseView } from "./DownloadProgress";

/** Chip de la barra de herramientas: la fase actual de la generación, visible aunque se cierre el diálogo. */
export function GenerationStatus() {
  const generation = useSession((s) => s.generation);
  const qr = useSession((s) => s.qrProgress);
  if (!isGenerating(generation)) return null;
  const view = phaseView(generation, qr);
  if (!view) return null;
  return <Chip color="info" size="small" label={`${view.title.replace("…", "")}${view.detail ? ` · ${view.detail}` : ""}`} role="status" data-testid="generation-status" />;
}
