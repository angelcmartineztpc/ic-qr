"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { saveBlob } from "@/lib/export/save-blob";
import { useRuntime } from "@/lib/state/StoreProvider";
import { patchSession } from "@/lib/state/stores";

import { useBuilderActions } from "@/components/records/useBuilderActions";
import { useConfirmDetailed } from "@/components/ui/ConfirmDialog";
import { useNotify } from "@/components/ui/NotificationsProvider";

import { createExportActions, type ExportActions } from "./export-actions";

export function useExportActions(): ExportActions {
  const runtime = useRuntime();
  const notify = useNotify();
  const confirm = useConfirmDetailed();
  const builder = useBuilderActions();
  const router = useRouter();
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
          router.push("/editor");
        },
      }),
    [runtime, notify, confirm, builder, router],
  );
}
