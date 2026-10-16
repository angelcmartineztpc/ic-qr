import { useMemo } from "react";

import { FormControlLabel, Switch } from "@/components/qr-produccion/ui";
import type { ReviewModel } from "@/services/qr-produccion/excel/review";
import type { DuplicateDecision, DuplicateStrategy, QRRecord } from "@/types";

import styles from "./DuplicateList.module.css";

const describe = (draft: { area: string; mesa: string; menuUrl: string }) => [draft.mesa, draft.area].filter(Boolean).join(" · ") || draft.menuUrl;

export interface DuplicateListProps {
  model: ReviewModel;
  strategy: DuplicateStrategy;
  decisions: Record<number, DuplicateDecision>;
  existing: Readonly<Record<string, QRRecord>>;
  onDecision(row: number, decision: DuplicateDecision): void;
}

/** Grupos de duplicados. En «Revisar manualmente» cada copia tiene su interruptor Conservar/Descartar. */
export function DuplicateList({ model, strategy, decisions, existing, onDecision }: DuplicateListProps) {
  const byRow = useMemo(() => new Map(model.rows.map((r) => [r.row, r])), [model.rows]);
  const projectRows = new Set(model.projectGroups.flatMap((g) => g.rows));
  const items = [
    ...model.projectGroups.map((group) => {
      const original = existing[group.existingRecordIds[0] ?? ""];
      return { key: `project-${group.key}`, title: `Ya existe en el proyecto: ${original ? describe(original) : "pieza existente"}`, copies: group.rows, against: "a la pieza existente" };
    }),
    ...model.fileGroups.flatMap((group) => {
      const [first, ...rest] = group.rows;
      const copies = rest.filter((row) => !projectRows.has(row));
      const draft = byRow.get(first ?? 0)?.draft;
      return first === undefined || copies.length === 0 ? [] : [{ key: `file-${group.key}`, title: `Fila ${first}: ${draft ? describe(draft) : ""}`, copies, against: `a la fila ${first}` }];
    }),
  ];

  if (items.length === 0) return <p className={styles.empty}>No se encontraron duplicados.</p>;

  return (
    <ul className={styles.list} aria-label="Grupos de duplicados">
      {items.map((item) => (
        <li key={item.key} className={styles.group}>
          <strong>{item.title}</strong>
          <ul className={styles.copies}>
            {item.copies.map((row) => {
              const decision = decisions[row] ?? "discard";
              return (
                <li key={row} className={styles.copy}>
                  <span>
                    Fila {row}: igual {item.against}
                  </span>
                  {strategy === "review" ? (
                    <FormControlLabel
                      control={<Switch checked={decision === "keep"} onChange={(e) => onDecision(row, e.target.checked ? "keep" : "discard")} slotProps={{ input: { "aria-label": `Conservar la fila ${row}` } }} />}
                      label={decision === "keep" ? "Conservar" : "Descartar"}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
