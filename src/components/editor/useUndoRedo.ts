"use client";

import { useEffect, useSyncExternalStore } from "react";

import { useRuntime } from "@/lib/state/StoreProvider";

import { useEditorActions } from "./useEditorActions";

/**
 * Deshacer y rehacer del proyecto (el mismo historial del editor visual) con
 * Ctrl/Cmd + Z y Mayús + Ctrl/Cmd + Z, salvo mientras se escribe en un campo.
 */
export function useUndoRedo(): { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void } {
  const runtime = useRuntime();
  const editor = useEditorActions();
  const state = useSyncExternalStore(
    (listener) => runtime.history.subscribe(listener),
    () => `${runtime.history.canUndo}|${runtime.history.canRedo}`,
    () => "false|false",
  );
  const [canUndo, canRedo] = state.split("|").map((v) => v === "true") as [boolean, boolean];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  return { canUndo, canRedo, undo: () => void editor.undo(), redo: () => void editor.redo() };
}
