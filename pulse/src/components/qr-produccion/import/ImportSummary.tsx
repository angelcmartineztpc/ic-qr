import { CircleCheck, TriangleAlert } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { Chip, Tab, Tabs } from "@/components/qr-produccion/ui";
import type { ReviewModel } from "@/services/qr-produccion/excel/review";
import { duplicateInProjectText } from "@/services/qr-produccion/validation/messages.es";
import type { DuplicateDecision, DuplicateStrategy, ImportIssue, ImportResult, QRRecord } from "@/types";

import { DuplicateList } from "./DuplicateList";
import styles from "./ImportSummary.module.css";
import { IssueList } from "./IssueList";

export interface ImportSummaryProps {
  result: ImportResult;
  model: ReviewModel;
  strategy: DuplicateStrategy;
  decisions: Record<number, DuplicateDecision>;
  existing: Readonly<Record<string, QRRecord>>;
  onDecision(row: number, decision: DuplicateDecision): void;
}

function Stat({ label, value, ok, testId }: { label: string; value: number; ok: boolean; testId: string }): ReactElement {
  return <Chip data-testid={testId} color={ok ? "success" : "warning"} variant="outlined" icon={ok ? <CircleCheck size={16} /> : <TriangleAlert size={16} />} label={`${label}: ${value}`} />;
}

/** Resumen (§S1.9): encontrados, válidos, con errores y duplicados, con pestañas Errores / Duplicados / Avisos. */
export function ImportSummary({ result, model, strategy, decisions, existing, onDecision }: ImportSummaryProps) {
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

  return (
    <section aria-label="Resumen de la importación" className={styles.summary}>
      <div className={styles.stats} role="group" aria-label="Totales">
        <Chip data-testid="stat-total" variant="outlined" label={`Filas encontradas: ${stats.totalRows}`} />
        <Stat testId="stat-valid" label="Válidas" value={stats.valid} ok />
        <Stat testId="stat-errors" label="Con errores" value={stats.withErrors} ok={stats.withErrors === 0} />
        <Stat testId="stat-duplicates" label="Duplicadas" value={stats.duplicates} ok={stats.duplicates === 0} />
      </div>
      <p className={styles.sheet}>
        Hoja «{result.sheetName}», cabecera en la fila {result.headerRow}.
        {result.stats.emptyRowsSkipped > 0 ? ` ${result.stats.emptyRowsSkipped} filas vacías se ignoraron.` : ""}
      </p>
      <Tabs value={tab} onChange={(_, value) => setTab(value as typeof tab)} variant="scrollable" aria-label="Detalle de la importación">
        <Tab value="errors" label={`Errores (${result.errors.length})`} />
        <Tab value="duplicates" label={`Duplicados (${stats.duplicates})`} />
        <Tab value="warnings" label={`Avisos (${warnings.length + fileDuplicates.length})`} />
      </Tabs>
      <div role="tabpanel">
        {tab === "errors" ? <IssueList issues={result.errors} label="Errores" empty="No hay errores: todas las filas son válidas." /> : null}
        {tab === "duplicates" ? <DuplicateList model={model} strategy={strategy} decisions={decisions} existing={existing} onDecision={onDecision} /> : null}
        {tab === "warnings" ? <IssueList issues={[...warnings, ...fileDuplicates]} label="Avisos" empty="No hay avisos." /> : null}
      </div>
    </section>
  );
}
