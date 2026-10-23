"use client";

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useMemo, useState, type ReactElement } from "react";

import type { ReviewModel } from "@/lib/excel/review";
import { duplicateInProjectText } from "@/lib/validation/messages.es";
import type { DuplicateDecision, DuplicateStrategy, ImportIssue, ImportResult, QRRecord } from "@/types";

import { DuplicateList } from "./DuplicateList";
import { IssueList } from "./IssueList";

export interface ImportSummaryProps {
  result: ImportResult;
  model: ReviewModel;
  strategy: DuplicateStrategy;
  decisions: Record<number, DuplicateDecision>;
  existing: Readonly<Record<string, QRRecord>>;
  onDecision(row: number, decision: DuplicateDecision): void;
  onEditMapping?: (() => void) | undefined;
}

function StatCard({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning";
  testId: string;
}): ReactElement {
  const toneStyles =
    tone === "success"
      ? "border-emerald-500/35 bg-emerald-500/8 text-foreground"
      : tone === "warning"
        ? "border-amber-500/45 bg-amber-500/10 text-foreground"
        : "border-divider bg-background/60 text-foreground";
  const iconColor =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted";

  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${toneStyles}`}>
      <span className={`flex shrink-0 items-center ${iconColor}`} aria-hidden="true">
        {tone === "neutral" ? (
          <DescriptionOutlinedIcon fontSize="small" />
        ) : tone === "success" ? (
          <CheckCircleIcon fontSize="small" />
        ) : (
          <WarningAmberIcon fontSize="small" />
        )}
      </span>
      <div data-testid={testId} className=" flex min-w-0 flex-col">
        <span className="text-xs font-medium text-muted">{`${label}: `}</span>
        <strong className="text-xl font-bold leading-tight tabular-nums sm:text-2xl">{value}</strong>
      </div>
    </div>
  );
}

/** Resumen (§S1.9): encontrados, válidos, con errores y duplicados, con pestañas Errores / Duplicados / Avisos. */
export function ImportSummary({ result, model, strategy, decisions, existing, onDecision, onEditMapping }: ImportSummaryProps) {
  const { stats } = model;
  const [tab, setTab] = useState<"errors" | "duplicates" | "warnings">(stats.withErrors > 0 ? "errors" : stats.duplicates > 0 ? "duplicates" : "warnings");

  // Los duplicados contra el proyecto se calculan en el cliente: se muestran como avisos de fila.
  const warnings = useMemo<ImportIssue[]>(() => {
    const byId = existing;
    const projectDuplicates: ImportIssue[] = model.projectGroups.flatMap((group) =>
      group.rows.map((row): ImportIssue => {
        const original = byId[group.existingRecordIds[0] ?? ""];
        const text = duplicateInProjectText(original ? [original.mesa, original.area].filter(Boolean).join(" · ") : "pieza existente", ["area", "mesa"]);
        return { row, field: "record", value: null, label: text.label, message: text.message, severity: "warning", code: "DUPLICATE_IN_PROJECT" };
      }),
    );
    return [...result.warnings.filter((w) => w.code !== "DUPLICATE_IN_FILE"), ...projectDuplicates];
  }, [result.warnings, model.projectGroups, existing]);

  const fileDuplicates = result.warnings.filter((w) => w.code === "DUPLICATE_IN_FILE");
  const allValidNoErrors = stats.withErrors === 0 && stats.valid > 0;

  return (
    <section aria-label="Resumen de la importación" className="flex flex-col gap-4 rounded-xl border border-divider bg-surface p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-3">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Diagnóstico del archivo</span>
          <h2 className="m-0 text-base font-semibold tracking-tight text-foreground">{result.fileName}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="m-0 rounded-md border border-divider bg-background/60 px-2.5 py-1 text-xs font-medium text-muted">
            Hoja «{result.sheetName}», cabecera en la fila {result.headerRow}.
            {result.stats.emptyRowsSkipped > 0 ? ` ${result.stats.emptyRowsSkipped} filas vacías se ignoraron.` : ""}
          </p>
          {onEditMapping ? (
            <button
              type="button"
              onClick={onEditMapping}
              className="cursor-pointer rounded-md border border-divider bg-background px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-surface"
            >
              Revisar columnas
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Totales">
        <StatCard testId="stat-total" label="Filas encontradas" value={stats.totalRows} tone="neutral" />
        <StatCard testId="stat-valid" label="Válidas" value={stats.valid} tone="success" />
        <StatCard testId="stat-errors" label="Con errores" value={stats.withErrors} tone={stats.withErrors === 0 ? "success" : "warning"} />
        <StatCard testId="stat-duplicates" label="Duplicadas" value={stats.duplicates} tone={stats.duplicates === 0 ? "success" : "warning"} />
      </div>

      {allValidNoErrors ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-emerald-500/35 bg-emerald-500/8 px-3.5 py-2.5 text-xs text-foreground">
          <CheckCircleIcon fontSize="small" className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div>
            <strong className="font-semibold">
              {stats.duplicates === 0
                ? `Las ${stats.valid} filas son 100% válidas y están listas para importar.`
                : `${stats.valid} filas válidas listas para revisar duplicados (${stats.duplicates}).`}
            </strong>{" "}
            <span className="text-muted">
              {warnings.length + fileDuplicates.length > 0
                ? "Las notas de abajo son informativas (columnas opcionales o formato) y no impiden generar tus códigos QR."
                : "Todos los campos obligatorios fueron verificados correctamente."}
            </span>
          </div>
        </div>
      ) : null}

      <div className="border-b border-divider">
        <Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" aria-label="Detalle de la importación">
          <Tab id="import-tab-errors" aria-controls="import-tabpanel-errors" value="errors" label={`Errores (${result.errors.length})`} />
          <Tab id="import-tab-duplicates" aria-controls="import-tabpanel-duplicates" value="duplicates" label={`Duplicados (${stats.duplicates})`} />
          <Tab id="import-tab-warnings" aria-controls="import-tabpanel-warnings" value="warnings" label={`Avisos (${warnings.length + fileDuplicates.length})`} />
        </Tabs>
      </div>

      <div
        role="tabpanel"
        id={`import-tabpanel-${tab}`}
        aria-labelledby={`import-tab-${tab}`}
      >
        {tab === "errors" ? <IssueList issues={result.errors} label="Errores" empty="No hay errores: todas las filas son válidas." /> : null}
        {tab === "duplicates" ? <DuplicateList model={model} strategy={strategy} decisions={decisions} existing={existing} onDecision={onDecision} /> : null}
        {tab === "warnings" ? <IssueList issues={[...warnings, ...fileDuplicates]} label="Avisos" empty="No hay avisos." /> : null}
      </div>
    </section>
  );
}
