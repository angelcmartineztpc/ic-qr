"use client";

import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { useMemo } from "react";

import type { ReviewModel } from "@/lib/excel/review";
import type { DuplicateDecision, DuplicateStrategy, QRRecord } from "@/types";

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

  if (items.length === 0) return <p className="m-0 py-4 text-sm text-muted">No se encontraron duplicados.</p>;

  return (
    <ul className="m-0 flex max-h-96 list-none flex-col gap-3 overflow-auto p-0" aria-label="Grupos de duplicados">
      {items.map((item) => (
        <li key={item.key} className="rounded border border-divider p-3 text-sm">
          <strong>{item.title}</strong>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {item.copies.map((row) => {
              const decision = decisions[row] ?? "discard";
              return (
                <li key={row} className="flex flex-wrap items-center justify-between gap-2">
                  <span>Fila {row}: igual {item.against}</span>
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
