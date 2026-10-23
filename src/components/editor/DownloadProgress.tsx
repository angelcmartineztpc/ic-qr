"use client";

import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import LinearProgress from "@mui/material/LinearProgress";
import { useId } from "react";

import { useSession } from "@/lib/state/StoreProvider";
import { isGenerating } from "@/lib/state/stores";

import { ModalLayout } from "@/components/ui/ModalLayout";

import type { ExportActions } from "./export-actions";

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Texto y barra de cada fase (§S5): «Generando PDF…», «Preparando descarga…», «Descargando…». */
export function phaseView(g: { phase: string; done: number; total: number; bytes: number; size: number }, qr: { done: number; total: number }) {
  switch (g.phase) {
    case "resolving":
      return {
        step: 1,
        title: "Preparando los QR…",
        detail: qr.total > 0 ? `${qr.done} / ${qr.total} piezas` : "",
        value: qr.total > 0 ? (qr.done / qr.total) * 100 : null,
      };
    case "generating":
      return {
        step: 2,
        title: "Generando PDF…",
        detail: `${g.done} / ${g.total} piezas`,
        value: g.total > 0 ? (g.done / g.total) * 100 : null,
      };
    case "preparing":
      return { step: 2, title: "Preparando descarga…", detail: "", value: null };
    case "downloading":
      return {
        step: 3,
        title: "Descargando…",
        detail: `${mb(g.bytes)} de ${mb(g.size)}`,
        value: g.size > 0 ? (g.bytes / g.size) * 100 : null,
      };
    default:
      return null;
  }
}

const PHASES = ["1. QR", "2. PDF", "3. Descarga"];

/** Diálogo no descartable mientras se genera: fase, barra, contador y [Cancelar]. */
export function DownloadProgress({ actions }: { actions: ExportActions }) {
  const id = useId();
  const generation = useSession((s) => s.generation);
  const qr = useSession((s) => s.qrProgress);
  const view = isGenerating(generation) ? phaseView(generation, qr) : null;
  const pct = view?.value != null ? Math.round(view.value) : null;

  return (
    <Dialog open={view !== null} fullWidth maxWidth="xs" aria-labelledby={`${id}-title`} aria-describedby={`${id}-detail`}>
      <ModalLayout.Header
        id={`${id}-title`}
        badge={pct !== null ? <span className="text-sm font-semibold text-primary tabular-nums">{pct} %</span> : null}
      >
        {view?.title ?? ""}
      </ModalLayout.Header>
      <ModalLayout.Body dividers={false}>
        <div role="status" aria-live="polite" className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-1.5" aria-hidden>
            {PHASES.map((label, idx) => {
              const active = (view?.step ?? 1) >= idx + 1;
              return (
                <div
                  key={label}
                  className={`rounded px-2 py-1 text-center text-xs font-medium ${active ? "bg-primary/10 text-primary" : "bg-background text-muted"}`}
                >
                  {label}
                </div>
              );
            })}
          </div>
          <LinearProgress
            variant={view?.value == null ? "indeterminate" : "determinate"}
            value={view?.value ?? 0}
            aria-label={view?.title ?? "Progreso"}
            data-testid="download-bar"
            className="h-2 rounded-full"
          />
          <p id={`${id}-detail`} className="m-0 text-sm text-muted tabular-nums" data-testid="download-detail">
            {view?.detail || " "}
          </p>
        </div>
      </ModalLayout.Body>
      <ModalLayout.Footer>
        <Button onClick={() => actions.cancel()} color="inherit" data-testid="download-cancel">
          Cancelar
        </Button>
      </ModalLayout.Footer>
    </Dialog>
  );
}
