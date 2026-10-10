"use client";

import { useEffect, useMemo, useState } from "react";

import { tileInputOf, type TileContext } from "@/lib/app/tile-preview-client";
import { useProject, useRuntime } from "@/lib/state/StoreProvider";
import type { PreviewTileResult } from "@/schemas/preview";
import type { QRRecord } from "@/types";

/**
 * La pieza dibujada por el servidor con el diseño actual del proyecto. Conserva
 * la imagen anterior mientras llega la nueva (sin parpadeo al editar).
 */
export function useTile(record: QRRecord | undefined, detail: "full" | "low" = "full"): { result: PreviewTileResult | undefined; error: string | null } {
  const { tiles } = useRuntime();
  const templateId = useProject((p) => p.templateId);
  const templateOverrides = useProject((p) => p.templateOverrides);
  const layout = useProject((p) => p.layout);
  const context = useMemo<TileContext>(() => ({ templateId, templateOverrides, layout, detail }), [templateId, templateOverrides, layout, detail]);
  const input = useMemo(() => (record ? tileInputOf(record) : undefined), [record]);

  const [fetched, setFetched] = useState<PreviewTileResult | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // Lo ya cacheado se lee al renderizar (sin parpadeo y sin setState en el efecto).
  const cached = input ? tiles.peek(context, input) : undefined;

  useEffect(() => {
    if (!input || tiles.peek(context, input)) return;
    let current = true;
    tiles.request(context, input).then(
      (next) => {
        if (!current) return;
        setFetched(next);
        setError(null);
      },
      (e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : "No se pudo dibujar la pieza");
      },
    );
    return () => {
      current = false;
    };
  }, [tiles, context, input]);

  return { result: cached ?? fetched, error: cached ? null : error };
}

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
