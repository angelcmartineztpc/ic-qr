import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { saveBlob } from "@/services/qr-produccion/export/save-blob";
import { useRuntime } from "@/services/qr-produccion/state/StoreProvider";
import { patchSession } from "@/services/qr-produccion/state/stores";

import { useBuilderActions } from "@/components/qr-produccion/records/useBuilderActions";
import { useConfirmDetailed } from "@/components/qr-produccion/layout/ConfirmDialog";
import { useNotify } from "@/components/qr-produccion/layout/NotificationsProvider";

import { createExportActions, type ExportActions } from "./export-actions";

export function useExportActions(): ExportActions {
  const runtime = useRuntime();
  const notify = useNotify();
  const confirm = useConfirmDetailed();
  const builder = useBuilderActions();
  const navigate = useNavigate();
  return useMemo(
    () =>
      createExportActions({
        runtime,
        notify,
        confirm,
        now: () => new Date(),
        download: saveBlob,
        resolve: builder.resolve,
        goToFix: (recordId) => {
          patchSession(runtime.session, (s) => ({ filter: "all", query: "", selection: { ...s.selection, currentId: recordId } }));
          navigate("/qr-produccion");
        },
      }),
    [runtime, notify, confirm, builder, navigate],
  );
}
