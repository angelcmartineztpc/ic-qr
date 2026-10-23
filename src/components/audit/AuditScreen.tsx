"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import { useCallback, useRef, useState, type DragEvent } from "react";

import { ApiError } from "@/lib/app/api-client";
import { auditPdf, type AuditProgress } from "@/lib/audit/audit-client";
import { PdfOpenError } from "@/lib/audit/load-pdf";
import { STATUS_HELP, destinationOf, isHttpUrl, type AuditRow } from "@/lib/audit/models";
import { auditCsv } from "@/lib/audit/report";

import { useNotify } from "@/components/ui/NotificationsProvider";
import { Panel } from "@/components/ui/Panel";

type Phase = { name: "idle" } | { name: "running"; file: string; progress: AuditProgress | null } | { name: "done"; file: string; progress: AuditProgress } | { name: "error"; message: string };

const friendly = (error: unknown): string => {
  if (error instanceof PdfOpenError) return error.message;
  if (error instanceof ApiError) return error.status === 429 ? "Hay demasiadas comprobaciones a la vez. Espera un momento e inténtalo de nuevo." : error.message;
  return "No se pudo terminar la revisión. Inténtalo de nuevo; si sigue igual, prueba con otro PDF.";
};

/** Cada tarjeta lleva una esquina grande distinta (bento asimétrico). */
const TILE_SHAPES = ["rounded-tl-[28px] rounded-tr-lg rounded-b-lg", "rounded-tr-[28px] rounded-tl-lg rounded-b-lg", "rounded-bl-[28px] rounded-r-lg rounded-tl-lg", "rounded-br-[28px] rounded-l-lg rounded-tr-lg"];

function Tile({ index, label, value, tone }: { index: number; label: string; value: number; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "bg-success/10 text-success" : tone === "bad" ? "bg-error/10 text-error" : "bg-surface-subtle text-foreground";
  return (
    <div className={`flex flex-col gap-1 p-4 ${TILE_SHAPES[index]} ${color}`}>
      <span className="text-3xl font-bold tabular-nums">{value}</span>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

const PAGE_SIZE = 24;

/** Tarjeta visual: la pieza tal como está en el PDF, con el veredicto encima. */
function ResultCard({ row }: { row: AuditRow }) {
  const help = STATUS_HELP[row.status];
  const good = help.tone === "good";
  const link = row.url && isHttpUrl(row.url) ? (row.finalUrl || row.url) : null;
  return (
    <li className={`flex flex-col overflow-hidden rounded-t-[28px] rounded-b-xl border bg-surface [content-visibility:auto] ${good ? "border-divider" : "border-error/40"}`}>
      <div className="relative bg-white">
        {row.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL generada en el navegador
          <img src={row.thumb} alt={`Vista de ${row.piece}`} loading="lazy" className="block aspect-square w-full object-contain" />
        ) : (
          <div className="aspect-square w-full bg-surface-subtle" />
        )}
        <span className={`absolute left-3 top-3 inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold shadow-sm ${good ? "bg-success text-white" : "bg-error text-white"}`}>
          {good ? <CheckCircleIcon sx={{ fontSize: 16 }} aria-hidden /> : <ErrorIcon sx={{ fontSize: 16 }} aria-hidden />}
          {good ? "Funciona" : help.headline}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3.5">
        <p className="m-0 truncate text-sm font-semibold text-foreground" title={row.piece}>{row.piece}</p>
        <p className="m-0 text-xs text-muted">
          {row.piece === `Página ${row.page}` ? null : <>Página {row.page}{row.url ? " · " : ""}</>}
          {row.url ? <>{good ? "Abre" : "Destino"}: <span className="font-medium text-foreground">{destinationOf(row)}</span></> : null}
        </p>
        {good ? null : <p className="m-0 mt-1 text-xs leading-relaxed text-foreground">{help.advice}</p>}
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-8 items-center pt-1 text-xs font-semibold text-primary">
            Probar el enlace ↗<span className="sr-only"> (se abre en otra pestaña)</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

/** Auditoría de QR de un PDF: el PDF se lee en el navegador y solo las direcciones viajan al servidor. */
export function AuditScreen() {
  const notify = useNotify();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const start = useCallback(
    async (file: File) => {
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        setPhase({ name: "error", message: "Ese archivo no es un PDF. Sube el PDF de tus piezas." });
        return;
      }
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setOnlyProblems(false);
      setVisible(PAGE_SIZE);
      setPhase({ name: "running", file: file.name, progress: null });
      try {
        const final = await auditPdf(file, controller.signal, (progress) => setPhase({ name: "running", file: file.name, progress }));
        setPhase({ name: "done", file: file.name, progress: final });
        const { totalQr, errors } = final.summary;
        if (totalQr === 0) notify({ message: "No encontramos ningún QR en el PDF.", severity: "warning", group: "audit" });
        else if (errors === 0) notify({ message: `Los ${totalQr} QR funcionan correctamente.`, severity: "success", group: "audit" });
        else notify({ message: `${errors} de ${totalQr} QR necesitan revisión.`, severity: "warning", group: "audit" });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = friendly(error);
        setPhase({ name: "error", message });
        notify({ message, severity: "error", group: "audit" });
      }
    },
    [notify],
  );

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && phase.name !== "running") void start(file);
  };

  const progress = phase.name === "running" || phase.name === "done" ? phase.progress : null;
  const rows = progress?.rows ?? [];
  const bad = (r: AuditRow) => STATUS_HELP[r.status].tone === "bad";
  // Al terminar, lo que hay que corregir va primero.
  const shown = onlyProblems ? rows.filter(bad) : phase.name === "done" ? [...rows].sort((a, b) => Number(bad(b)) - Number(bad(a))) : rows;
  const running = phase.name === "running";

  const download = () => {
    if (phase.name !== "done") return;
    const url = URL.createObjectURL(new Blob([auditCsv(phase.progress.rows)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${phase.file.replace(/\.pdf$/i, "")}-auditoria-qr.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      {phase.name === "idle" || phase.name === "error" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          data-testid="audit-dropzone"
          className={`flex flex-col items-center gap-4 rounded-t-[28px] rounded-b-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${over ? "border-primary bg-primary/5" : "border-divider bg-surface"}`}
        >
          <div aria-hidden className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FactCheckOutlinedIcon />
          </div>
          <div className="flex max-w-lg flex-col gap-1.5">
            <h2 className="m-0 text-xl font-semibold tracking-tight text-foreground">Arrastra aquí el PDF de tus piezas</h2>
            <p className="m-0 text-sm leading-relaxed text-muted">Leemos cada QR, abrimos su enlace y te decimos cuáles funcionan y cuáles hay que corregir.</p>
          </div>
          {phase.name === "error" ? (
            <p role="alert" className="m-0 max-w-lg rounded-xl bg-error/10 px-4 py-2.5 text-sm font-medium text-error">
              {phase.message}
            </p>
          ) : null}
          <Button variant="contained" size="large" onClick={() => input.current?.click()} className="!rounded-full !px-6">
            Elegir PDF
          </Button>
          <input
            ref={input}
            type="file"
            hidden
            accept=".pdf,application/pdf"
            data-testid="audit-input"
            aria-label="Elegir PDF para auditar"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void start(file);
            }}
          />
        </div>
      ) : null}

      {phase.name === "running" || phase.name === "done" ? (
        <Panel
          title={phase.file}
          className="rounded-t-[28px] rounded-b-xl"
          actions={
            running ? (
              <Button variant="outlined" color="inherit" size="small" onClick={() => {
                  abort.current?.abort();
                  setPhase({ name: "idle" });
                }} className="!rounded-full">
                Cancelar
              </Button>
            ) : (
              <>
                <Button variant="outlined" color="inherit" size="small" startIcon={<FileDownloadOutlinedIcon />} onClick={download} className="!rounded-full">
                  Descargar informe (.csv)
                </Button>
                <Button variant="contained" size="small" onClick={() => setPhase({ name: "idle" })} className="!rounded-full">
                  Auditar otro PDF
                </Button>
              </>
            )
          }
        >
          <div className="flex flex-col gap-1.5">
            <LinearProgress
              variant={progress ? "determinate" : "indeterminate"}
              value={progress ? (progress.done / progress.total) * 100 : 0}
              aria-label="Avance de la revisión"
              className="!h-2 !rounded-full"
            />
            <p className="m-0 text-xs text-muted tabular-nums" aria-live="polite">
              {running ? (progress ? `Revisando… página ${progress.done} de ${progress.total}` : "Abriendo el PDF…") : `Revisión terminada · ${progress?.total ?? 0} páginas`}
            </p>
          </div>

          {progress ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile index={0} label="QR revisados" value={progress.summary.totalQr} />
              <Tile index={1} label="Funcionan" value={progress.summary.ok} tone="good" />
              <Tile index={2} label="Necesitan revisión" value={progress.summary.errors} tone={progress.summary.errors > 0 ? "bad" : undefined} />
              <Tile index={3} label="Páginas sin QR" value={rows.filter((r) => r.status === "no_qr").length} />
            </div>
          ) : null}

          {rows.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar resultados">
                {[
                  { label: `Todos (${rows.length})`, value: false },
                  { label: `Con problemas (${rows.filter((r) => STATUS_HELP[r.status].tone === "bad").length})`, value: true },
                ].map((f) => (
                  <Button key={f.label} size="small" variant={onlyProblems === f.value ? "contained" : "outlined"} color={onlyProblems === f.value ? "primary" : "inherit"} aria-pressed={onlyProblems === f.value} onClick={() => {
                    setOnlyProblems(f.value);
                    setVisible(PAGE_SIZE);
                  }} className="!rounded-full">
                    {f.label}
                  </Button>
                ))}
              </div>
              {shown.length === 0 ? (
                <p className="m-0 rounded-xl bg-surface-subtle px-4 py-8 text-center text-sm text-muted">No hay QR con problemas.</p>
              ) : (
                <ul aria-label="Resultados por pieza" className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-4">
                  {shown.slice(0, visible).map((row, i) => (
                    <ResultCard key={`${row.page}-${i}`} row={row} />
                  ))}
                </ul>
              )}
              {shown.length > visible ? (
                <Button variant="outlined" color="inherit" onClick={() => setVisible((v) => v + PAGE_SIZE)} className="!self-center">
                  Ver más ({shown.length - visible} restantes)
                </Button>
              ) : null}
            </>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
