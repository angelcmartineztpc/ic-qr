import { useMemo } from "react";

import { useRuntime } from "@/services/qr-produccion/state/StoreProvider";

import { useNotify } from "@/components/qr-produccion/layout/NotificationsProvider";

import { createEditorActions, type EditorActions } from "./editor-actions";

export function useEditorActions(): EditorActions {
  const runtime = useRuntime();
  const notify = useNotify();
  return useMemo(() => createEditorActions({ runtime, notify }), [runtime, notify]);
}
