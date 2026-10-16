
import { useMemo } from "react";

import { saveBlob } from "@/services/qr-produccion/export/save-blob";
import { useRuntime } from "@/services/qr-produccion/state/StoreProvider";

import { useConfirmDetailed } from "@/components/qr-produccion/layout/ConfirmDialog";
import { useNotify } from "@/components/qr-produccion/layout/NotificationsProvider";

import { createBuilderActions, type BuilderActions } from "./builder-actions";

/** Acciones del builder ya conectadas a las notificaciones y confirmaciones de la interfaz. */
export function useBuilderActions(): BuilderActions {
  const runtime = useRuntime();
  const notify = useNotify();
  const confirm = useConfirmDetailed();
  return useMemo(() => createBuilderActions({ runtime, notify, confirm, now: () => new Date().toISOString(), download: saveBlob }), [runtime, notify, confirm]);
}
