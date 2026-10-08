import type { ReactNode } from "react";

/** Bloque con borde y respiración uniforme: así todas las pantallas separan y agrupan igual. */
export function Panel({ title, description, actions, children, className = "", label }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label ?? title} className={`flex flex-col gap-4 rounded-xl border border-divider bg-surface p-4 sm:p-6 ${className}`}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? <h2 className="m-0 text-lg font-semibold">{title}</h2> : null}
            {description ? <p className="m-0 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
