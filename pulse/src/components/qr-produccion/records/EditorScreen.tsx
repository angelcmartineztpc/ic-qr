import { FileUp, QrCode } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { RecordForm } from "@/components/qr-produccion/forms/RecordForm";
import { Pagination } from "@/components/qr-produccion/layout/Pagination";
import { StepFooter } from "@/components/qr-produccion/layout/StepFooter";
import { Button, Skeleton } from "@/components/qr-produccion/ui";
import { matchesFilter, matchesQuery, paginate, type CounterFilter } from "@/services/qr-produccion/state/counters";
import { useProject, useRuntime, useSession } from "@/services/qr-produccion/state/StoreProvider";
import { patchSession } from "@/services/qr-produccion/state/stores";
import type { QRRecord, RecordDraft } from "@/types";

import { BuilderToolbar } from "./BuilderToolbar";
import styles from "./EditorScreen.module.css";
import { MoveToDialog } from "./MoveToDialog";
import { PersistenceBanners } from "./PersistenceBanners";
import { RecordCard } from "./RecordCard";
import { RecordCounters } from "./RecordCounters";
import { RecordDetail } from "./RecordDetail";
import { SortableStrip } from "./SortableStrip";
import { useBuilderActions } from "./useBuilderActions";

function EmptyState({ onAdd, readOnly }: { onAdd(): void; readOnly: boolean }) {
  return (
    <section aria-label="Sin piezas" className={styles.empty}>
      <QrCode size={56} className={styles.emptyIcon} aria-hidden />
      <h2 className={styles.emptyTitle}>Aún no hay piezas</h2>
      <p className={styles.emptyText}>Agrega una pieza con el formulario o importa un Excel: cada fila se convierte en una pieza con su QR.</p>
      <div className={styles.emptyActions}>
        <Button variant="contained" onClick={onAdd} disabled={readOnly}>
          + Agregar nuevo
        </Button>
        <Button to="/qr-produccion/importar" variant="outlined" startIcon={<FileUp size={18} />}>
          Importar Excel
        </Button>
      </div>
    </section>
  );
}

/** Document builder (spec §12): navegar, editar, duplicar, eliminar, agregar y reordenar piezas. */
export function EditorScreen() {
  const runtime = useRuntime();
  const actions = useBuilderActions();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const selection = useSession((s) => s.selection);
  const filter = useSession((s) => s.filter);
  const query = useSession((s) => s.query);
  const excluded = useSession(useShallow((s) => s.excluded));
  const order = useProject(useShallow((p) => p.order));
  const recordsById = useProject((p) => p.recordsById);
  const overrides = useProject((p) => p.layout.overrides);

  const [editing, setEditing] = useState<QRRecord | "new" | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const all = useMemo(() => order.flatMap((id) => (recordsById[id] ? [recordsById[id] as QRRecord] : [])), [order, recordsById]);
  const excludedSet = useMemo(() => new Set(excluded), [excluded]);
  const visible = useMemo(() => all.filter((r) => matchesFilter(r, filter, excludedSet) && matchesQuery(r, query)), [all, filter, excludedSet, query]);
  const customized = useMemo(() => new Set(Object.keys(overrides)), [overrides]);
  const withErrors = useMemo(() => all.filter((r) => r.qrError !== undefined || r.validationErrors.some((i) => i.severity === "error")).length, [all]);

  const index = Math.max(0, visible.findIndex((r) => r.id === selection.currentId));
  const current = visible[index];
  const strip = paginate(visible, selection.page, selection.pageSize);

  const choose = useCallback(
    (id: string) => {
      const at = visible.findIndex((r) => r.id === id);
      patchSession(runtime.session, (s) => ({ selection: { ...s.selection, currentId: id, page: at >= 0 ? Math.floor(at / s.selection.pageSize) + 1 : s.selection.page } }));
    },
    [visible, runtime.session],
  );
  const go = (offset: number) => {
    const next = visible[index + offset];
    if (next) choose(next.id);
  };
  const setPage = (page: number) => patchSession(runtime.session, (s) => ({ selection: { ...s.selection, page } }));
  const setFilter = (next: CounterFilter) => patchSession(runtime.session, (s) => ({ filter: next, selection: { ...s.selection, page: 1 } }));

  const onSubmit = async (rawDraft: RecordDraft): Promise<boolean> => {
    const draft = await actions.prepareDraft(rawDraft, editing && editing !== "new" ? editing : undefined);
    if (!draft) return false;
    if (editing === "new") {
      patchSession(runtime.session, { filter: "all", query: "" }); // que la pieza nueva sea visible
      await actions.add(draft);
      return true;
    }
    return editing ? actions.save(editing.id, draft) : false;
  };

  const handlers = {
    onSelect: choose,
    onEdit: (id: string) => setEditing(recordsById[id] ?? null),
    onDuplicate: (id: string) => void actions.duplicate(id),
    onMove: (id: string) => setMoving(id),
    onDelete: (id: string) => void actions.remove([id]),
    onDownloadSvg: (id: string) => void actions.downloadPieceSvg(id),
  };
  const moveRecord = moving ? recordsById[moving] : undefined;
  const moveIndex = moving ? order.indexOf(moving) : -1;

  if (!hydrated) {
    return (
      <div className={styles.root} aria-busy="true" aria-label="Cargando proyecto">
        <Skeleton variant="text" width={180} height={44} />
        <Skeleton variant="rectangular" height={56} />
        <Skeleton variant="rectangular" height={320} />
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <PersistenceBanners actions={actions} />
      <BuilderToolbar actions={actions} total={all.length} onAdd={() => setEditing("new")} />

      {all.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} readOnly={readOnly} />
      ) : (
        <>
          <RecordCounters onFilter={setFilter} />
          {visible.length === 0 ? (
            <p role="status" className={styles.noMatch}>
              Ninguna pieza coincide con el filtro o la búsqueda.{" "}
              <Button size="small" onClick={() => patchSession(runtime.session, { filter: "all", query: "" })}>
                Quitar filtros
              </Button>
            </p>
          ) : selection.view === "pages" && current ? (
            <>
              <RecordDetail record={current} position={index + 1} total={visible.length} readOnly={readOnly} actions={actions} onEdit={() => setEditing(current)} onMove={() => setMoving(current.id)} onPrevious={() => go(-1)} onNext={() => go(1)} />
              <h2 className={styles.subtitle}>Todas las piezas</h2>
              <SortableStrip records={strip.items} offset={(strip.page - 1) * selection.pageSize} selectedId={current.id} customized={customized} readOnly={readOnly} reorderable={filter === "all" && query === ""} onReorder={(id, to) => actions.move(id, to)} {...handlers} />
              <Pagination page={strip.page} pages={strip.pages} onChange={setPage} label="Tira" />
            </>
          ) : (
            <>
              <ul className={styles.grid} aria-label="Piezas">
                {strip.items.map((record, i) => (
                  <li key={record.id}>
                    <RecordCard record={record} position={(strip.page - 1) * selection.pageSize + i + 1} selected={record.id === current?.id} customized={customized.has(record.id)} readOnly={readOnly} {...handlers} />
                  </li>
                ))}
              </ul>
              <Pagination page={strip.page} pages={strip.pages} onChange={setPage} label="Página" />
            </>
          )}
        </>
      )}

      <StepFooter
        next={{ href: "/qr-produccion/estilo", label: "Siguiente: Estilo del QR", disabled: all.length === 0 }}
        {...(all.length === 0 ? { note: "Agrega al menos una pieza para continuar" } : withErrors > 0 ? { note: `${withErrors} ${withErrors === 1 ? "pieza tiene" : "piezas tienen"} errores: corrígelas antes de exportar` } : {})}
      />

      <RecordForm open={editing !== null} record={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSubmit={onSubmit} />
      <MoveToDialog open={moving !== null} label={moveRecord ? [moveRecord.mesa, moveRecord.area].filter(Boolean).join(" · ") : ""} current={moveIndex + 1} total={all.length} onClose={() => setMoving(null)} onMove={(to) => moving && actions.move(moving, to)} />
    </div>
  );
}
