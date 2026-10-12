"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { saveBlob } from "@/lib/export/save-blob";
import { useRuntime } from "@/lib/state/StoreProvider";

import { useBuilderActions } from "@/components/records/useBuilderActions";
import { useConfirmDetailed } from "@/components/ui/ConfirmDialog";
import { useNotify } from "@/components/ui/NotificationsProvider";

import { createImportActions, type ImportActions } from "./import-actions";

/** Acciones de importación conectadas a notificaciones, confirmaciones y a la resolución de QR en lote del builder. */
export function useImportActions(): ImportActions {
  const runtime = useRuntime();
  const notify = useNotify();
  const confirm = useConfirmDetailed();
  const builder = useBuilderActions();
  const router = useRouter();
  return useMemo(
    () => createImportActions({ runtime, notify, confirm, now: () => new Date().toISOString(), download: saveBlob, resolve: builder.resolve, goToPieces: () => router.push("/editor") }),
    [runtime, notify, confirm, builder, router],
  );
}
