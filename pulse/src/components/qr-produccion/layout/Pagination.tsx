import { Pagination as KitPagination } from "@/components/qr-produccion/ui";

import styles from "./Pagination.module.css";

/** Paginación con textos en español; «Página N de M» para que siempre se sepa dónde se está. */
export function Pagination({ page, pages, onChange, label = "Página" }: { page: number; pages: number; onChange(page: number): void; label?: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={`Paginación de ${label.toLowerCase()}`} className={styles.nav}>
      <KitPagination count={pages} page={page} onChange={(_e, value) => onChange(value)} siblingCount={1} boundaryCount={1} showFirstButton showLastButton />
      <span className={styles.position} data-testid="page-position">
        {label} {page} de {pages}
      </span>
    </nav>
  );
}
