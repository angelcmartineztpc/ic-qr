"use client";

import { useMemo } from "react";

import { useRuntime } from "@/lib/state/StoreProvider";

import { useNotify } from "@/components/ui/NotificationsProvider";

import { createEditorActions, type EditorActions } from "./editor-actions";

export function useEditorActions(): EditorActions {
  const runtime = useRuntime();
  const notify = useNotify();
  return useMemo(() => createEditorActions({ runtime, notify }), [runtime, notify]);
}
