"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";

import { packGrid, paginate } from "@/lib/document/sheet";
import type { PDFOptions } from "@/types";

const PAGE_HEIGHT = 230; // px por hoja en miniatura

/**
 * Hojas en miniatura de baja definición: cada pieza es un recuadro numerado en
 * la posición exacta que dará `packGrid` (la misma que usa el PDF). Está
 * virtualizada: con 1000 piezas solo hay unas pocas hojas en el DOM.
 */
export function PDFPreview({ tile, options, count }: { tile: { width: number; height: number }; options: PDFOptions; count: number }) {
  const parent = useRef<HTMLDivElement>(null);
  const grid = useMemo(() => {
    try {
      return packGrid({ tile, options });
    } catch {
      return null;
    }
  }, [tile, options]);
  const slots = useMemo(() => (grid ? paginate(count, grid) : []), [grid, count]);
  const pages = grid ? Math.ceil(count / grid.perPage) : 0;
  const virtualizer = useVirtualizer({ count: pages, getScrollElement: () => parent.current, estimateSize: () => PAGE_HEIGHT + 12, overscan: 2 });

  if (!grid || pages === 0) return <p className="m-0 text-sm text-muted">No hay hojas que mostrar.</p>;
  const { width, height } = grid.pageMm;
  const scale = (PAGE_HEIGHT * 0.9) / height;

  return (
    <div ref={parent} className="max-h-96 overflow-auto rounded border border-divider bg-black/5 p-2" role="region" aria-label="Hojas del PDF" data-testid="pdf-preview">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const items = slots.filter((slot) => slot.page === row.index);
          return (
            <figure key={row.index} className="m-0 flex flex-col items-center" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: row.size, transform: `translateY(${row.start}px)` }}>
              <svg width={width * scale} height={height * scale} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Hoja ${row.index + 1} de ${pages}: ${items.length} piezas`}>
                <rect width={width} height={height} fill="#fff" stroke="#bbb" strokeWidth={0.4} />
                {items.map((slot) => (
                  <g key={slot.index}>
                    <rect x={slot.xMm} y={slot.yMm} width={tile.width} height={tile.height} fill="#e3f2fd" stroke="#1565c0" strokeWidth={0.3} />
                    <text x={slot.xMm + tile.width / 2} y={slot.yMm + tile.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(tile.width, tile.height) / 3} fill="#1565c0">
                      {slot.index + 1}
                    </text>
                  </g>
                ))}
              </svg>
              <figcaption className="text-xs text-muted">Hoja {row.index + 1} de {pages}</figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
