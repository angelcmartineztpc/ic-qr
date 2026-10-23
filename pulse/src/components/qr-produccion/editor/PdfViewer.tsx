import { ChevronLeft, ChevronRight, Minus, PanelLeft, Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { IconButton, MenuItem, TextField, ToggleButton, Tooltip } from "@/components/qr-produccion/ui";
import { packGrid, paginate } from "@/services/qr-produccion/document/sheet";
import type { PDFOptions, QRRecord } from "@/types";

import { svgDataUrl, useTile } from "@/components/qr-produccion/preview/useTile";

import styles from "./PdfViewer.module.css";

const PX_PER_MM_100 = 96 / 25.4; // 100 % = 96 ppp, como en un visor de PDF
const GAP = 16;
const PAD = 24;
const ZOOMS = [25, 50, 75, 100, 125, 150, 200, 300] as const;

type Zoom = { kind: "fit-width" } | { kind: "fit-page" } | { kind: "percent"; value: number };

/** Tamaño del elemento (se actualiza al redimensionar la ventana o abrir/cerrar paneles). */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Una pieza dibujada por el servidor con el diseño actual; mientras llega, un hueco numerado. */
const PieceImage = memo(function PieceImage({ record, number, widthPx }: { record: QRRecord; number: number; widthPx: number }) {
  const { result } = useTile(record, widthPx < 140 ? "low" : "full");
  return result ? (
    <img src={svgDataUrl(result.svg)} alt={`Pieza ${number}: ${[record.mesa, record.area].filter(Boolean).join(" · ")}`} className={styles.pieceImage} draggable={false} />
  ) : (
    <div className={styles.placeholder} aria-hidden>
      {number}
    </div>
  );
});

export interface PdfViewerProps {
  tile: { width: number; height: number };
  options: PDFOptions;
  /** Las piezas que se exportan, en su orden (la numeración del PDF es esta). */
  records: readonly QRRecord[];
  className?: string;
}

/**
 * Visor de las hojas del PDF, al estilo de un lector de PDF: miniaturas a la izquierda,
 * desplazamiento continuo, zoom (ajustar al ancho / a la página / porcentaje) y salto de
 * página. Las piezas son las reales (las dibuja el servidor), colocadas donde `packGrid`
 * las pondrá en el PDF. Virtualizado: con 1000 piezas solo se dibujan las hojas visibles.
 */
export function PdfViewer({ tile, options, records, className = "" }: PdfViewerProps) {
  const [viewport, size] = useSize<HTMLDivElement>();
  const [zoom, setZoom] = useState<Zoom>({ kind: "fit-width" });
  const [thumbs, setThumbs] = useState(true);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);

  const grid = useMemo(() => {
    try {
      return packGrid({ tile, options });
    } catch {
      return null;
    }
  }, [tile, options]);
  const slots = useMemo(() => (grid ? paginate(records.length, grid) : []), [grid, records.length]);
  const pages = grid ? Math.ceil(records.length / grid.perPage) : 0;

  const pageMm = grid?.pageMm ?? { width: 1, height: 1 };
  const fitWidth = Math.max(0.2, (size.width - 2 * PAD) / pageMm.width);
  const fitPage = Math.max(0.2, Math.min(fitWidth, (size.height - 2 * PAD) / pageMm.height));
  const scale = zoom.kind === "fit-width" ? fitWidth : zoom.kind === "fit-page" ? fitPage : (zoom.value / 100) * PX_PER_MM_100;
  const percent = Math.round((scale / PX_PER_MM_100) * 100);
  const pageW = pageMm.width * scale;
  const pageH = pageMm.height * scale;

  const virtualizer = useVirtualizer({ count: pages, getScrollElement: () => viewport.current, estimateSize: () => pageH + GAP, overscan: 1, paddingStart: PAD, paddingEnd: PAD });
  useEffect(() => virtualizer.measure(), [virtualizer, pageH]);

  const goTo = useCallback(
    (index: number) => {
      const next = Math.min(Math.max(0, index), Math.max(0, pages - 1));
      setPage(next);
      virtualizer.scrollToIndex(next, { align: "start" });
    },
    [pages, virtualizer],
  );

  const onScroll = () => {
    const element = viewport.current;
    if (!element || pages === 0) return;
    const index = Math.floor((element.scrollTop - PAD + element.clientHeight / 3) / (pageH + GAP));
    setPage(Math.min(Math.max(0, index), pages - 1));
  };

  const stepZoom = (direction: 1 | -1) => {
    const current = percent;
    const next = direction === 1 ? ZOOMS.find((z) => z > current + 1) : [...ZOOMS].reverse().find((z) => z < current - 1);
    if (next) setZoom({ kind: "percent", value: next });
  };

  const onKey = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).tagName === "INPUT") return;
    if (event.key === "PageDown" || (event.key === "ArrowRight" && event.altKey)) goTo(page + 1);
    else if (event.key === "PageUp" || (event.key === "ArrowLeft" && event.altKey)) goTo(page - 1);
    else if (event.key === "Home" && event.ctrlKey) goTo(0);
    else if (event.key === "End" && event.ctrlKey) goTo(pages - 1);
    else if ((event.ctrlKey || event.metaKey) && (event.key === "+" || event.key === "=")) stepZoom(1);
    else if ((event.ctrlKey || event.metaKey) && event.key === "-") stepZoom(-1);
    else return;
    event.preventDefault();
  };

  const commitPage = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isFinite(n)) goTo(Math.trunc(n) - 1);
    setDraft(null);
  };

  if (!grid || pages === 0) return <p className={styles.empty}>No hay hojas que mostrar.</p>;

  return (
    <div className={`${styles.viewer} ${className}`} data-testid="pdf-preview" role="region" aria-label="Visor del PDF">
      <div className={styles.toolbar} role="toolbar" aria-label="Controles del visor">
        <Tooltip title={thumbs ? "Ocultar miniaturas" : "Mostrar miniaturas"}>
          <ToggleButton value="thumbs" size="small" selected={thumbs} onChange={() => setThumbs((v) => !v)} aria-label="Miniaturas" className={styles.toggle}>
            <PanelLeft size={18} />
          </ToggleButton>
        </Tooltip>
        <span className={styles.separator} aria-hidden />
        <IconButton size="small" aria-label="Página anterior" onClick={() => goTo(page - 1)} disabled={page === 0} color="inherit">
          <ChevronLeft size={18} />
        </IconButton>
        <input
          aria-label="Página actual"
          data-testid="pdf-page-input"
          className={styles.pageInput}
          value={draft ?? String(page + 1)}
          inputMode="numeric"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitPage}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitPage();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") setDraft(null);
          }}
        />
        <span className={styles.pageCount} data-testid="pdf-page-count">/ {pages}</span>
        <IconButton size="small" aria-label="Página siguiente" onClick={() => goTo(page + 1)} disabled={page >= pages - 1} color="inherit">
          <ChevronRight size={18} />
        </IconButton>
        <span className={styles.separator} aria-hidden />
        <IconButton size="small" aria-label="Alejar" onClick={() => stepZoom(-1)} color="inherit">
          <Minus size={18} />
        </IconButton>
        <TextField
          select
          size="small"
          aria-label="Zoom"
          value={zoom.kind === "percent" ? String(zoom.value) : zoom.kind}
          onChange={(e) => {
            const v = e.target.value;
            setZoom(v === "fit-width" || v === "fit-page" ? { kind: v } : { kind: "percent", value: Number(v) });
          }}
          className={styles.zoom}
        >
          <MenuItem value="fit-width">Ajustar al ancho</MenuItem>
          <MenuItem value="fit-page">Ajustar a la página</MenuItem>
          {ZOOMS.map((z) => (
            <MenuItem key={z} value={String(z)}>
              {z} %
            </MenuItem>
          ))}
        </TextField>
        <span className={styles.percent} data-testid="pdf-zoom-percent" aria-live="polite">{percent} %</span>
        <IconButton size="small" aria-label="Acercar" onClick={() => stepZoom(1)} color="inherit">
          <Plus size={18} />
        </IconButton>
        <span className={styles.summary}>
          {records.length} {records.length === 1 ? "pieza" : "piezas"} · {grid.perPage} por hoja · {pageMm.width} × {pageMm.height} mm
        </span>
      </div>

      <div className={styles.body}>
        {thumbs ? <Thumbnails grid={grid} tile={tile} count={records.length} pages={pages} current={page} onSelect={goTo} /> : null}
        <div ref={viewport} className={styles.scroller} tabIndex={0} onScroll={onScroll} onKeyDown={onKey} aria-label="Hojas del PDF (PageUp y PageDown cambian de hoja)">
          <div style={{ height: virtualizer.getTotalSize(), minWidth: pageW + 2 * PAD, position: "relative" }}>
            {virtualizer.getVirtualItems().map((row) => {
              const first = row.index * grid.perPage;
              const items = slots.slice(first, first + grid.perPage);
              return (
                <figure key={row.index} className={styles.figure} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: pageH, transform: `translateY(${row.start}px)` }} aria-label={`Hoja ${row.index + 1} de ${pages}`}>
                  <div className={styles.sheet} style={{ width: pageW, height: pageH }}>
                    {items.map((slot) => {
                      const record = records[slot.index];
                      return record ? (
                        <div key={slot.index} className={styles.slot} style={{ left: slot.xMm * scale, top: slot.yMm * scale, width: tile.width * scale, height: tile.height * scale }}>
                          <PieceImage record={record} number={slot.index + 1} widthPx={tile.width * scale} />
                        </div>
                      ) : null;
                    })}
                  </div>
                </figure>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Miniaturas de las hojas (columna izquierda): recuadros numerados, virtualizados. */
function Thumbnails({ grid, tile, count, pages, current, onSelect }: { grid: NonNullable<ReturnType<typeof packGrid>>; tile: { width: number; height: number }; count: number; pages: number; current: number; onSelect(index: number): void }) {
  const parent = useRef<HTMLDivElement>(null);
  const width = 84;
  const height = Math.round((width * grid.pageMm.height) / grid.pageMm.width);
  const virtualizer = useVirtualizer({ count: pages, getScrollElement: () => parent.current, estimateSize: () => height + 34, overscan: 4 });
  useEffect(() => {
    virtualizer.scrollToIndex(current, { align: "auto" });
  }, [current, virtualizer]);
  const slots = useMemo(() => paginate(count, grid), [count, grid]);
  const scale = width / grid.pageMm.width;

  return (
    <div ref={parent} className={styles.thumbs} aria-label="Miniaturas de las hojas" data-testid="pdf-thumbnails">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const items = slots.slice(row.index * grid.perPage, (row.index + 1) * grid.perPage);
          return (
            <button
              key={row.index}
              type="button"
              onClick={() => onSelect(row.index)}
              aria-current={row.index === current ? "page" : undefined}
              aria-label={`Ir a la hoja ${row.index + 1}`}
              className={`${styles.thumb} ${row.index === current ? styles.thumbCurrent : ""}`}
              style={{ top: 0, height: row.size, transform: `translateY(${row.start}px)` }}
            >
              <span className={`${styles.thumbFrame} ${row.index === current ? styles.thumbFrameCurrent : ""}`} style={{ width, height }}>
                <svg width={width} height={height} viewBox={`0 0 ${grid.pageMm.width} ${grid.pageMm.height}`} aria-hidden className={styles.thumbSvg}>
                  {items.map((slot) => (
                    <rect key={slot.index} x={slot.xMm} y={slot.yMm} width={tile.width} height={tile.height} className={styles.thumbRect} strokeWidth={0.4 / scale / 10} />
                  ))}
                </svg>
              </span>
              {row.index + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
