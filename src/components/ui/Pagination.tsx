"use client";

import MuiPagination from "@mui/material/Pagination";

/** Paginación con textos en español; «Página N de M» para que siempre se sepa dónde se está. */
export function Pagination({ page, pages, onChange, label = "Página" }: { page: number; pages: number; onChange(page: number): void; label?: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={`Paginación de ${label.toLowerCase()}`} className="flex flex-col items-center gap-1">
      <MuiPagination
        count={pages}
        page={page}
        onChange={(_e, value) => onChange(value)}
        siblingCount={1}
        boundaryCount={1}
        showFirstButton
        showLastButton
        getItemAriaLabel={(type, p, selected) =>
          type === "page" ? `${selected ? "Página actual, " : "Ir a la "}página ${p}` : { first: "Primera página", last: "Última página", next: "Página siguiente", previous: "Página anterior", "start-ellipsis": "…", "end-ellipsis": "…" }[type]
        }
      />
      <span className="text-xs text-muted" data-testid="page-position">
        {label} {page} de {pages}
      </span>
    </nav>
  );
}
