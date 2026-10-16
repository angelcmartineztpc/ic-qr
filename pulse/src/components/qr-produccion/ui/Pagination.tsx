import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { HTMLAttributes } from "react";

import styles from "./Pagination.module.css";
import { cx } from "./utils";

type ItemType = "page" | "first" | "last" | "next" | "previous" | "start-ellipsis" | "end-ellipsis";

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  count: number;
  page: number;
  onChange?: (event: React.SyntheticEvent, page: number) => void;
  siblingCount?: number;
  boundaryCount?: number;
  showFirstButton?: boolean;
  showLastButton?: boolean;
  disabled?: boolean;
  getItemAriaLabel?: (type: ItemType, page: number | null, selected: boolean) => string;
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

const DEFAULT_LABEL: NonNullable<PaginationProps["getItemAriaLabel"]> = (type, page, selected) =>
  type === "page" ? `${selected ? "Página actual, " : "Ir a la "}página ${page}` : { first: "Primera página", last: "Última página", next: "Página siguiente", previous: "Página anterior", "start-ellipsis": "…", "end-ellipsis": "…" }[type];

export function Pagination({ count, page, onChange, siblingCount = 1, boundaryCount = 1, showFirstButton, showLastButton, disabled, getItemAriaLabel = DEFAULT_LABEL, className, ...rest }: PaginationProps) {
  const start = range(1, Math.min(boundaryCount, count));
  const end = range(Math.max(count - boundaryCount + 1, boundaryCount + 1), count);
  const sibStart = Math.max(Math.min(page - siblingCount, count - boundaryCount - siblingCount * 2 - 1), boundaryCount + 2);
  const sibEnd = Math.min(Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2), end.length > 0 ? end[0]! - 2 : count - 1);
  const items: Array<number | "start-ellipsis" | "end-ellipsis"> = [
    ...start,
    ...(sibStart > boundaryCount + 2 ? ["start-ellipsis" as const] : boundaryCount + 1 < count - boundaryCount ? [boundaryCount + 1] : []),
    ...range(sibStart, sibEnd),
    ...(sibEnd < count - boundaryCount - 1 ? ["end-ellipsis" as const] : count - boundaryCount > boundaryCount ? [count - boundaryCount] : []),
    ...end,
  ];
  const go = (e: React.SyntheticEvent, p: number) => p >= 1 && p <= count && p !== page && onChange?.(e, p);
  const nav = (type: ItemType, target: number, icon: React.ReactNode, off: boolean) => (
    <li key={type}><button type="button" className={styles.item} aria-label={getItemAriaLabel(type, target, false)} disabled={disabled || off} onClick={(e) => go(e, target)}>{icon}</button></li>
  );
  return (
    <nav aria-label="Paginación" className={cx(styles.nav, className)} {...rest}>
      <ul className={styles.list}>
        {showFirstButton ? nav("first", 1, <ChevronsLeft size={18} />, page <= 1) : null}
        {nav("previous", page - 1, <ChevronLeft size={18} />, page <= 1)}
        {items.map((it) =>
          typeof it === "number" ? (
            <li key={it}><button type="button" className={cx(styles.item, it === page && styles.on)} aria-label={getItemAriaLabel("page", it, it === page)} aria-current={it === page ? "page" : undefined} disabled={disabled} onClick={(e) => go(e, it)}>{it}</button></li>
          ) : (
            <li key={it} aria-hidden className={styles.gap}>…</li>
          ),
        )}
        {nav("next", page + 1, <ChevronRight size={18} />, page >= count)}
        {showLastButton ? nav("last", count, <ChevronsRight size={18} />, page >= count) : null}
      </ul>
    </nav>
  );
}
