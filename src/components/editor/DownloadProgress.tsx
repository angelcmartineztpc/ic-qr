"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import { useId } from "react";

import { useSession } from "@/lib/state/StoreProvider";
import { isGenerating } from "@/lib/state/stores";

import type { ExportActions } from "./export-actions";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Texto y barra de cada fase (§S5): «Generando PDF…», «Preparando descarga…», «Descargando…». */
export function phaseView(g: { phase: string; done: number; total: number; bytes: number; size: number }, qr: { done: number; total: number }) {
  switch (g.phase) {
    case "resolving":
      return { title: "Preparando los QR…", detail: qr.total > 0 ? `${qr.done} / ${qr.total} piezas` : "", value: qr.total > 0 ? (qr.done / qr.total) * 100 : null };
    case "generating":
      return { title: "Generando PDF…", detail: `${g.done} / ${g.total} piezas`, value: g.total > 0 ? (g.done / g.total) * 100 : null };
    case "preparing":
      return { title: "Preparando descarga…", detail: "", value: null };
    case "downloading":
      return { title: "Descargando…", detail: `${mb(g.bytes)} de ${mb(g.size)}`, value: g.size > 0 ? (g.bytes / g.size) * 100 : null };
    default:
      return null;
  }
}

/** Diálogo no descartable mientras se genera: fase, barra, contador y [Cancelar]. */
export function DownloadProgress({ actions }: { actions: ExportActions }) {
  const id = useId();
  const generation = useSession((s) => s.generation);
  const qr = useSession((s) => s.qrProgress);
  const view = isGenerating(generation) ? phaseView(generation, qr) : null;
  return (
    <Dialog open={view !== null} fullWidth maxWidth="xs" aria-labelledby={`${id}-title`} aria-describedby={`${id}-detail`}>
      <DialogTitle id={`${id}-title`}>{view?.title ?? ""}</DialogTitle>
      <DialogContent>
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <LinearProgress variant={view?.value == null ? "indeterminate" : "determinate"} value={view?.value ?? 0} aria-label={view?.title ?? "Progreso"} data-testid="download-bar" />
          <p id={`${id}-detail`} className="m-0 text-sm text-muted" data-testid="download-detail">
            {view?.detail || " "}
          </p>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => actions.cancel()} data-testid="download-cancel">
          Cancelar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
