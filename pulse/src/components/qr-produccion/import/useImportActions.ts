import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { useBuilderActions } from "@/components/qr-produccion/records/useBuilderActions";
import { useConfirmDetailed } from "@/components/qr-produccion/layout/ConfirmDialog";
import { useNotify } from "@/components/qr-produccion/layout/NotificationsProvider";
import { saveBlob } from "@/services/qr-produccion/export/save-blob";
import { useRuntime } from "@/services/qr-produccion/state/StoreProvider";

import { createImportActions, type ImportActions } from "./import-actions";

/** Acciones de importación conectadas a notificaciones, confirmaciones y a la resolución de QR en lote del builder. */
export function useImportActions(): ImportActions {
  const runtime = useRuntime();
  const notify = useNotify();
  const confirm = useConfirmDetailed();
  const builder = useBuilderActions();
  const navigate = useNavigate();
  return useMemo(
    () => createImportActions({ runtime, notify, confirm, now: () => new Date().toISOString(), download: saveBlob, resolve: builder.resolve, downloadExcel: builder.downloadExcel, goToPieces: () => navigate("/qr-produccion") }),
    [runtime, notify, confirm, builder, navigate],
  );
}
