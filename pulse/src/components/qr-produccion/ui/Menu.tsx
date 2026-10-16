import { useContext, useEffect, useId, useLayoutEffect, useRef, useState, type HTMLAttributes, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import styles from "./Menu.module.css";
import { NativeSelectContext } from "./TextField";
import { cx } from "./utils";

export interface MenuProps {
  /** Elemento que abrió el menú (normalmente `event.currentTarget`). */
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  id?: string;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

const ITEMS = '[role="menuitem"]:not(:disabled)';

/** Menú en portal anclado al botón: flechas/Inicio/Fin, Escape y clic fuera cierran; el foco vuelve al ancla. */
export function Menu({ anchorEl, open, onClose, id, children, className, ...rest }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const auto = useId();

  useLayoutEffect(() => {
    if (!open || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 240;
    setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
  }, [open, anchorEl]);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>(ITEMS)?.focus();
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node) && !anchorEl?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("pointerdown", away);
      anchorEl?.focus?.();
    };
    // onClose cambia en cada render del padre: solo importa al abrir/cerrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorEl, pos !== null]);

  if (!open || !anchorEl) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    else if (e.key === "Tab") onClose();
  };

  return createPortal(
    <div ref={ref} id={id ?? auto} role="menu" className={cx(styles.menu, className)} style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }} onKeyDown={onKeyDown} {...rest}>
      {children}
    </div>,
    document.body,
  );
}

export interface MenuItemProps extends Omit<HTMLAttributes<HTMLElement>, "onClick"> {
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  selected?: boolean;
  /** Dentro de TextField select/Select: valor de la <option>. */
  value?: string | number;
}

/** Dentro de un menú: <button role="menuitem">. Dentro de un select nativo: <option>. */
export function MenuItem({ onClick, disabled, selected, value, className, children, ...rest }: MenuItemProps) {
  const native = useContext(NativeSelectContext);
  if (native) return <option value={value} disabled={disabled}>{children}</option>;
  return (
    <button type="button" role="menuitem" disabled={disabled} aria-current={selected || undefined} className={cx(styles.item, selected && styles.selected, className)} onClick={onClick} {...(rest as object)}>
      {children}
    </button>
  );
}

export function ListItemIcon({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx(styles.icon, className)} aria-hidden {...rest} />;
}

export function ListSubheader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div role="presentation" className={cx(styles.subheader, className)} {...rest} />;
}
