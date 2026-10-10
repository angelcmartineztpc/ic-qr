"use client";

import DeleteIcon from "@mui/icons-material/Delete";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import { useRef, useState } from "react";

import { ApiError } from "@/lib/app/api-client";
import { checkLogoBeforeUpload, uploadLogo } from "@/lib/app/qr-style-client";
import { LOGO_MAX_SIZE_PCT, LOGO_MIN_SIZE_PCT, type QrLogo } from "@/schemas/qr-style";
import type { HexColor } from "@/types";

import { ColorField } from "./ColorField";

/** Logo en SVG al centro del QR: se sube, se sanea en el servidor y se guarda solo su geometría vectorial. */
export function LogoControls({ logo, disabled, onChange }: { logo: QrLogo | null; disabled: boolean; onChange(next: QrLogo | null): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mientras se arrastra se muestra el valor en vivo; solo al soltar se guarda (una entrada de deshacer y una petición de vista previa).
  const [dragSize, setDragSize] = useState<number | null>(null);
  const [dragMargin, setDragMargin] = useState<number | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkLogoBeforeUpload(file);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const geometry = await uploadLogo(file);
      onChange({ geometry, sizePct: logo?.sizePct ?? 20, marginModules: logo?.marginModules ?? 1, color: logo?.color ?? null, fileName: file.name.slice(0, 120) });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "No se pudo subir el logo");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <input ref={input} type="file" accept=".svg,image/svg+xml" hidden data-testid="logo-input" onChange={(event) => void pick(event.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={logo ? "outlined" : "contained"} startIcon={<UploadFileIcon />} disabled={disabled || busy} onClick={() => input.current?.click()}>
          {busy ? "Subiendo…" : logo ? "Cambiar logo" : "Subir logo (SVG)"}
        </Button>
        {logo ? (
          <>
            <span className="min-w-0 truncate text-sm text-muted" data-testid="logo-name">{logo.fileName}</span>
            <Button variant="text" color="error" startIcon={<DeleteIcon />} disabled={disabled} onClick={() => onChange(null)}>
              Quitar
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted">Solo SVG con contornos; se dibuja al centro sin perder nitidez.</span>
        )}
      </div>
      {error ? <Alert severity="error" role="alert" onClose={() => setError(null)}>{error}</Alert> : null}

      {logo ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span id="logo-size-label" className="text-sm font-medium">Tamaño del logo: {dragSize ?? logo.sizePct} % del QR</span>
            <Slider
              aria-labelledby="logo-size-label"
              value={dragSize ?? logo.sizePct}
              min={LOGO_MIN_SIZE_PCT}
              max={LOGO_MAX_SIZE_PCT}
              step={1}
              disabled={disabled}
              onChange={(_, v) => setDragSize(v as number)}
              onChangeCommitted={(_, v) => {
                setDragSize(null);
                onChange({ ...logo, sizePct: v as number });
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span id="logo-margin-label" className="text-sm font-medium">Espacio libre alrededor: {dragMargin ?? logo.marginModules} {(dragMargin ?? logo.marginModules) === 1 ? "módulo" : "módulos"}</span>
            <Slider
              aria-labelledby="logo-margin-label"
              value={dragMargin ?? logo.marginModules}
              min={0}
              max={3}
              step={0.5}
              disabled={disabled}
              onChange={(_, v) => setDragMargin(v as number)}
              onChangeCommitted={(_, v) => {
                setDragMargin(null);
                onChange({ ...logo, marginModules: v as number });
              }}
            />
          </div>
          <FormControlLabel
            control={<Switch checked={logo.color !== null} disabled={disabled} onChange={(event) => onChange({ ...logo, color: event.target.checked ? ("#000000" as HexColor) : null })} />}
            label="Pintar el logo de un solo color"
          />
          {logo.color !== null ? (
            <ColorField label="Color del logo" value={logo.color} custom autoLabel="" disabled={disabled} onChange={(color) => onChange({ ...logo, color })} onReset={() => onChange({ ...logo, color: null })} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
