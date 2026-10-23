"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import { useMemo, useState } from "react";

import { formatIssueLine } from "@/lib/validation/messages.es";
import type { ImportIssue } from "@/types";

import { useNotify } from "@/components/ui/NotificationsProvider";

const PAGE = 100;
const SEVERITY_COLOR = { error: "error", warning: "warning", info: "default" } as const;

/** Lista filtrable y copiable de problemas: «Fila 18: Falta Link del menú». */
export function IssueList({ issues, empty, label }: { issues: readonly ImportIssue[]; empty: string; label: string }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const notify = useNotify();

  const lines = useMemo(() => issues.map((issue) => ({ issue, text: formatIssueLine(issue) })), [issues]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    return needle === "" ? lines : lines.filter((l) => `${l.text} ${l.issue.message} ${l.issue.value ?? ""}`.toLocaleLowerCase("es").includes(needle));
  }, [lines, query]);

  if (issues.length === 0) return <p className="m-0 py-4 text-sm text-muted">{empty}</p>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filtered.map((l) => l.text).join("\n"));
      notify({ message: `${filtered.length} líneas copiadas`, severity: "success", group: "import" });
    } catch {
      notify({ message: "No se pudo copiar al portapapeles", severity: "error", group: "import" });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-divider bg-background/50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <TextField
            size="small"
            fullWidth={false}
            className="w-full sm:!w-72"
            label="Filtrar"
            placeholder={`Buscar en ${label.toLocaleLowerCase("es")}…`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            slotProps={{ htmlInput: { "aria-label": `Filtrar ${label}` } }}
          />
          <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => void copy()}>
            Copiar lista
          </Button>
        </div>
        <span className="text-xs font-semibold text-muted" aria-live="polite">
          {filtered.length === issues.length ? `${issues.length} en total` : `${filtered.length} de ${issues.length}`}
        </span>
      </div>
      <ul className="m-0 flex max-h-96 list-none flex-col gap-2 overflow-auto p-0" aria-label={label}>
        {filtered.slice(0, shown).map(({ issue, text }, index) => {
          const isOptionalColumn = issue.code === "MISSING_COLUMN" && issue.severity === "warning";
          const chipColor = isOptionalColumn ? "info" : SEVERITY_COLOR[issue.severity];
          const chipLabel = isOptionalColumn ? "Opcional" : issue.severity === "error" ? "Error" : issue.severity === "warning" ? "Aviso" : "Info";
          return (
            <li
              key={`${issue.row}-${issue.code}-${issue.field}-${index}`}
              className="flex items-start gap-3 rounded-lg border border-divider bg-background/60 p-3 text-sm"
            >
              <Chip size="small" color={chipColor} variant="outlined" label={chipLabel} className="mt-0.5 shrink-0 font-medium" />
              <div className="min-w-0 flex-1">
                <div>
                  <strong className="font-semibold text-foreground">{text}</strong>
                  {issue.value ? <span className="text-muted"> — «{issue.value}»</span> : null}
                </div>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                  {issue.message}
                  {isOptionalColumn && issue.field === "qrUrl"
                    ? " · El código QR se generará automáticamente a partir del Link del menú."
                    : isOptionalColumn
                      ? " · No impide importar tus piezas."
                      : ""}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {filtered.length > shown ? (
        <div>
          <Button size="small" variant="outlined" onClick={() => setShown((n) => n + PAGE)}>
            Mostrar {Math.min(PAGE, filtered.length - shown)} más
          </Button>
        </div>
      ) : null}
    </div>
  );
}
