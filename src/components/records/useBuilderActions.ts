"use client";

import { useMemo } from "react";

import { saveBlob } from "@/lib/export/save-blob";
import { useRuntime } from "@/lib/state/StoreProvider";

import { useConfirmDetailed } from "@/components/ui/ConfirmDialog";
import { useNotify } from "@/components/ui/NotificationsProvider";

import { createBuilderActions, type BuilderActions } from "./builder-actions";

/** Acciones del builder ya conectadas a las notificaciones y confirmaciones de la interfaz. */
export function useBuilderActions(): BuilderActions {
  const runtime = useRuntime();
  const notify = useNotify();
  const confirm = useConfirmDetailed();
  return useMemo(() => createBuilderActions({ runtime, notify, confirm, now: () => new Date().toISOString(), download: saveBlob }), [runtime, notify, confirm]);
}
