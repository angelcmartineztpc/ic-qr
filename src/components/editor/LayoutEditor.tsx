"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { boxesOverlap, moveBox, nudge, resizeBox, snapBox, snapTargets, type Handle, type NudgeDirection } from "@/lib/layout/geometry";
import type { Box, Layout, TileSpec } from "@/types";

import type { EditResult } from "./editor-actions";

const RULER = 8; // mm de margen para las reglas
const HANDLE = 2; // mm
const CORNERS: Handle[] = ["nw", "ne", "sw", "se"];
const ALL_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Key = keyof Layout;
const LABELS: Record<Key, string> = { qr: "QR", content: "Bloque de texto" };
const COLORS: Record<Key, string> = { qr: "#1565c0", content: "#e65100" };

interface Drag {
  key: Key;
  mode: "move" | Handle;
  start: { x: number; y: number };
  origin: Box;
  box: Box;
  guides: { x?: number; y?: number };
}

export interface LayoutEditorProps {
  tile: TileSpec;
  layout: Layout;
  /** Imagen de la pieza ya dibujada por el servidor (data URL) y el id de la pieza. */
  imageUrl: string | undefined;
  title: string;
  selected: Key;
  showGrid: boolean;
  gridMm: number;
  snap: boolean;
  disabled: boolean;
  onSelect(key: Key): void;
  onCommit(key: Key, box: Box): EditResult;
  onReject(message: string): void;
}

const fmt = (n: number) => n.toFixed(2).replace(/\.?0+$/, "");
const describe = (key: Key, box: Box) => `${LABELS[key]}: x ${fmt(box.x)} mm, y ${fmt(box.y)} mm, ${fmt(box.width)} × ${fmt(box.height)} mm`;

/**
 * Editor de composición (§S4): la pieza dibujada por el servidor con una capa
 * de manejadores encima. Durante el arrastre solo se mueve la capa (estado
 * local); al soltar se hace UN commit, que es una sola entrada de deshacer.
 */
export function LayoutEditor({ tile, layout, imageUrl, title, selected, showGrid, gridMm, snap, disabled, onSelect, onCommit, onReject }: LayoutEditorProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);

  const effective: Layout = drag ? { ...layout, [drag.key]: drag.box } : layout;
  const overlap = boxesOverlap(effective.qr, effective.content);
  const intersection = useMemo(() => {
    if (!overlap) return null;
    const { qr, content } = effective;
    const x = Math.max(qr.x, content.x);
    const y = Math.max(qr.y, content.y);
    return { x, y, width: Math.min(qr.x + qr.width, content.x + content.width) - x, height: Math.min(qr.y + qr.height, content.y + content.height) - y };
  }, [overlap, effective]);

  /** Puntero → mm de la pieza (con getScreenCTM, válido con cualquier zoom). */
  const toMm = useCallback((event: { clientX: number; clientY: number }) => {
    const element = svg.current;
    const ctm = element?.getScreenCTM();
    if (!element || !ctm) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: point.x, y: point.y, pxPerMm: ctm.a };
  }, []);

  const begin = (event: PointerEvent, key: Key, mode: Drag["mode"]) => {
    if (disabled) return;
    const point = toMm(event);
    if (!point) return;
    event.stopPropagation();
    event.preventDefault();
    onSelect(key);
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const next: Drag = { key, mode, start: point, origin: layout[key], box: layout[key], guides: {} };
    dragRef.current = next;
    setDrag(next);
  };

  const move = (event: PointerEvent) => {
    const current = dragRef.current;
    if (!current) return;
    const point = toMm(event);
    if (!point) return;
    const dx = point.x - current.start.x;
    const dy = point.y - current.start.y;
    const other = layout[current.key === "qr" ? "content" : "qr"];
    let box: Box;
    let guides: Drag["guides"] = {};
    if (current.mode === "move") {
      box = moveBox(current.origin, dx, dy, tile);
      if (snap) {
        const snapped = snapBox(box, snapTargets(tile, other), 6 / point.pxPerMm);
        box = moveBox(snapped.box, 0, 0, tile);
        guides = snapped.guides;
      }
    } else {
      box = resizeBox(current.origin, current.mode, dx, dy, tile, { lockAspect: current.key === "qr" });
    }
    const next = { ...current, box, guides };
    dragRef.current = next;
    if (frame.current === null) {
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (dragRef.current) setDrag(dragRef.current);
      });
    }
  };

  const end = () => {
    const current = dragRef.current;
    dragRef.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setDrag(null);
    if (!current) return;
    const result = onCommit(current.key, current.box);
    if (!result.ok) onReject(result.message);
  };

  const cancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  // Esc cancela un arrastre en curso aunque el foco no esté en la caja.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        dragRef.current = null;
        setDrag(null);
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [dragging]);

  const onKey = (event: KeyboardEvent, key: Key) => {
    if (disabled) return;
    if (event.key === "Escape" && dragRef.current) {
      cancel();
      return;
    }
    const directions: Record<string, NudgeDirection> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 5 : event.altKey ? 0.1 : 0.5;
    const result = onCommit(key, nudge(layout[key], direction, step, tile));
    if (!result.ok) onReject(result.message);
  };

  const { width: W, height: H } = tile;
  const ticks = Array.from({ length: Math.floor(Math.max(W, H) / 5) + 1 }, (_, i) => i * 5);
  const gridLines = showGrid ? Array.from({ length: Math.floor(Math.max(W, H) / gridMm) + 1 }, (_, i) => i * gridMm) : [];
  const keys: Key[] = ["content", "qr"];

  return (
    <svg
      ref={svg}
      viewBox={`${-RULER} ${-RULER} ${W + 2 * RULER} ${H + 2 * RULER}`}
      className="w-full select-none"
      style={{ touchAction: "none", maxHeight: "min(75vh, 44rem)" }}
      role="group"
      aria-label={`Editor de composición de ${title}. Flechas: mover 0,5 mm; Mayús: 5 mm; Alt: 0,1 mm`}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={cancel}
      data-testid="layout-editor"
    >
      {/* Reglas en mm */}
      <g aria-hidden fill="#666" fontSize="2.2" stroke="#999" strokeWidth="0.1">
        {ticks.map((t) => (
          <g key={t}>
            {t <= W ? <line x1={t} y1={-2} x2={t} y2={0} /> : null}
            {t <= W && t % 10 === 0 ? <text x={t} y={-3} textAnchor="middle" stroke="none">{t}</text> : null}
            {t <= H ? <line x1={-2} y1={t} x2={0} y2={t} /> : null}
            {t <= H && t % 10 === 0 ? <text x={-3} y={t + 0.8} textAnchor="end" stroke="none">{t}</text> : null}
          </g>
        ))}
      </g>

      <rect x={0} y={0} width={W} height={H} fill="#fff" stroke="#bbb" strokeWidth="0.15" />
      {imageUrl ? <image href={imageUrl} x={0} y={0} width={W} height={H} preserveAspectRatio="none" /> : null}

      {/* Rejilla opcional y margen de seguridad */}
      <g aria-hidden stroke="#90caf9" strokeWidth="0.06" opacity="0.7">
        {gridLines.map((g) => (
          <g key={g}>
            {g <= W ? <line x1={g} y1={0} x2={g} y2={H} /> : null}
            {g <= H ? <line x1={0} y1={g} x2={W} y2={g} /> : null}
          </g>
        ))}
      </g>
      <rect aria-hidden x={tile.safeMarginMm} y={tile.safeMarginMm} width={W - 2 * tile.safeMarginMm} height={H - 2 * tile.safeMarginMm} fill="none" stroke="#9e9e9e" strokeWidth="0.15" strokeDasharray="1 1" />
      <text aria-hidden x={W / 2} y={H + 5} textAnchor="middle" fontSize="2.4" fill="#666">{`${fmt(W)} × ${fmt(H)} mm`}</text>

      {intersection ? <rect aria-hidden {...intersection} fill="#d32f2f" opacity="0.35" data-testid="overlap-tint" /> : null}

      {keys.map((key) => {
        const box = effective[key];
        const isSelected = selected === key;
        return (
          <g key={key}>
            <g
              role="group"
              tabIndex={disabled ? -1 : 0}
              aria-label={describe(key, box)}
              data-testid={`box-${key}`}
              onKeyDown={(e) => onKey(e, key)}
              onFocus={() => onSelect(key)}
              className="outline-none focus-visible:[&>rect]:stroke-[0.7]"
            >
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                fill={COLORS[key]}
                fillOpacity={isSelected ? 0.08 : 0.03}
                stroke={COLORS[key]}
                strokeWidth={isSelected ? 0.5 : 0.3}
                strokeDasharray={key === "content" ? "2 1" : undefined}
                style={{ cursor: disabled ? "default" : "move" }}
                onPointerDown={(e) => begin(e, key, "move")}
              />
            </g>
            {isSelected && !disabled
              ? (key === "qr" ? CORNERS : ALL_HANDLES).map((handle) => {
                  const cx = handle.includes("w") ? box.x : handle.includes("e") ? box.x + box.width : box.x + box.width / 2;
                  const cy = handle.includes("n") ? box.y : handle.includes("s") ? box.y + box.height : box.y + box.height / 2;
                  return (
                    <rect
                      key={handle}
                      x={cx - HANDLE / 2}
                      y={cy - HANDLE / 2}
                      width={HANDLE}
                      height={HANDLE}
                      fill="#fff"
                      stroke={COLORS[key]}
                      strokeWidth="0.4"
                      data-testid={`handle-${key}-${handle}`}
                      style={{ cursor: `${handle}-resize` }}
                      onPointerDown={(e) => begin(e, key, handle)}
                    />
                  );
                })
              : null}
          </g>
        );
      })}

      {/* Guías de imán mientras se arrastra */}
      {drag?.guides.x !== undefined ? <line aria-hidden x1={drag.guides.x} y1={0} x2={drag.guides.x} y2={H} stroke="#e91e63" strokeWidth="0.2" /> : null}
      {drag?.guides.y !== undefined ? <line aria-hidden x1={0} y1={drag.guides.y} x2={W} y2={drag.guides.y} stroke="#e91e63" strokeWidth="0.2" /> : null}
    </svg>
  );
}
