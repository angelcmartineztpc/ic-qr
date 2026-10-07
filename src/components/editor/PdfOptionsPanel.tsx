"use client";

import Alert from "@mui/material/Alert";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";

import { describeSheet, packGrid, SheetLayoutError } from "@/lib/document/sheet";
import type { PDFOptions } from "@/types";

import type { EditResult } from "./editor-actions";
import { NumberField } from "./NumberField";

const ok: EditResult = { ok: true };
const between = (min: number, max: number, v: number): EditResult => (v >= min && v <= max ? ok : { ok: false, message: `Debe estar entre ${min} y ${max}` });

/** Resultado en vivo de packGrid: «6 por página · 3 páginas» o por qué no cabe. */
export function describePacking(tile: { width: number; height: number }, options: PDFOptions, count: number): { ok: true; text: string } | { ok: false; text: string } {
  try {
    const grid = packGrid({ tile, options });
    return { ok: true, text: options.mode === "single" ? `${count} ${count === 1 ? "página" : "páginas"}, una pieza por página (${grid.pageMm.width} × ${grid.pageMm.height} mm)` : describeSheet(count, grid) };
  } catch (error) {
    if (error instanceof SheetLayoutError) return { ok: false, text: error.message };
    throw error;
  }
}

export interface PdfOptionsPanelProps {
  options: PDFOptions;
  tile: { width: number; height: number };
  count: number;
  disabled: boolean;
  onChange(patch: Partial<PDFOptions>): void;
}

export function PdfOptionsPanel({ options, tile, count, disabled, onChange }: PdfOptionsPanelProps) {
  const packing = describePacking(tile, options, count);
  const margin = (side: keyof PDFOptions["margins"], label: string) => (
    <NumberField key={`${side}-${options.margins[side]}`} label={label} unit="mm" step={1} value={options.margins[side]} disabled={disabled} onCommit={(v) => (between(0, 100, v).ok ? (onChange({ margins: { ...options.margins, [side]: v } }), ok) : between(0, 100, v))} />
  );
  return (
    <section aria-label="Opciones del PDF" className="flex flex-col gap-3">
      <Alert severity={packing.ok ? "success" : "error"} role={packing.ok ? "status" : "alert"} data-testid="packing-result">
        {packing.text}
      </Alert>
      <TextField select size="small" label="Disposición" value={options.mode} disabled={disabled} onChange={(e) => onChange({ mode: e.target.value as PDFOptions["mode"] })}>
        <MenuItem value="sheet">Hoja con varias piezas</MenuItem>
        <MenuItem value="single">Una pieza por página</MenuItem>
      </TextField>
      {options.mode === "sheet" ? (
        <>
          <div className="grid grid-cols-2 gap-x-3">
            <TextField select size="small" label="Página" value={options.pageSize.kind} disabled={disabled} onChange={(e) => onChange({ pageSize: e.target.value === "custom" ? { kind: "custom", widthMm: 210, heightMm: 297 } : { kind: e.target.value as "A4" | "Letter" } })}>
              <MenuItem value="A4">A4</MenuItem>
              <MenuItem value="Letter">Carta (Letter)</MenuItem>
              <MenuItem value="custom">Personalizada</MenuItem>
            </TextField>
            <TextField select size="small" label="Orientación" value={options.orientation} disabled={disabled} onChange={(e) => onChange({ orientation: e.target.value as PDFOptions["orientation"] })}>
              <MenuItem value="portrait">Vertical</MenuItem>
              <MenuItem value="landscape">Horizontal</MenuItem>
              <MenuItem value="auto">Automática</MenuItem>
            </TextField>
          </div>
          {options.pageSize.kind === "custom" ? (
            <div className="grid grid-cols-2 gap-x-3">
              <NumberField key={`pw-${options.pageSize.widthMm}`} label="Ancho de página" unit="mm" step={1} value={options.pageSize.widthMm} disabled={disabled} onCommit={(v) => (between(10, 1500, v).ok && options.pageSize.kind === "custom" ? (onChange({ pageSize: { kind: "custom", widthMm: v, heightMm: options.pageSize.heightMm } }), ok) : between(10, 1500, v))} />
              <NumberField key={`ph-${options.pageSize.heightMm}`} label="Alto de página" unit="mm" step={1} value={options.pageSize.heightMm} disabled={disabled} onCommit={(v) => (between(10, 1500, v).ok && options.pageSize.kind === "custom" ? (onChange({ pageSize: { kind: "custom", widthMm: options.pageSize.widthMm, heightMm: v } }), ok) : between(10, 1500, v))} />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-x-3">
            {margin("top", "Margen superior")}
            {margin("bottom", "Margen inferior")}
            {margin("left", "Margen izquierdo")}
            {margin("right", "Margen derecho")}
            <NumberField key={`gap-${options.gapMm}`} label="Separación" unit="mm" step={1} value={options.gapMm} disabled={disabled} onCommit={(v) => (between(0, 50, v).ok ? (onChange({ gapMm: v }), ok) : between(0, 50, v))} />
            <NumberField key={`bleed-${options.bleedMm}`} label="Sangrado" unit="mm" step={0.5} value={options.bleedMm} disabled={disabled} onCommit={(v) => (between(0, 5, v).ok ? (onChange({ bleedMm: v }), ok) : between(0, 5, v))} />
          </div>
          <FormControlLabel control={<Switch checked={options.center} disabled={disabled} onChange={(e) => onChange({ center: e.target.checked })} />} label="Centrar las piezas en la hoja" />
        </>
      ) : null}
      <TextField select size="small" label="Texto en el PDF" value={options.textMode} disabled={disabled} helperText={options.textMode === "live" ? "Texto editable: requiere la fuente instalada al abrirlo en Illustrator" : "Contornos: se ve igual en cualquier equipo"} onChange={(e) => onChange({ textMode: e.target.value as PDFOptions["textMode"] })}>
        <MenuItem value="outlined">Convertido a contornos (recomendado)</MenuItem>
        <MenuItem value="live">Texto vivo</MenuItem>
      </TextField>
      <FormControlLabel control={<Switch checked={options.includeQrBackground} disabled={disabled} onChange={(e) => onChange({ includeQrBackground: e.target.checked })} />} label="Fondo blanco bajo el QR" />
      {!options.includeQrBackground ? <Alert severity="warning">Sin fondo blanco el QR puede no leerse sobre un metal oscuro o con relieve.</Alert> : null}
    </section>
  );
}
