"use client";

import QrCode2Icon from "@mui/icons-material/QrCode2";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { isExportable } from "@/lib/records/qr-state";
import { matchesFilter, matchesQuery, paginate, type CounterFilter } from "@/lib/state/counters";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession } from "@/lib/state/stores";
import type { QRRecord, RecordDraft } from "@/types";

import { RecordForm } from "@/components/forms/RecordForm";
import { Pagination } from "@/components/ui/Pagination";

import { BuilderToolbar } from "./BuilderToolbar";
import { MoveToDialog } from "./MoveToDialog";
import { PersistenceBanners } from "./PersistenceBanners";
import { RecordCard } from "./RecordCard";
import { RecordCounters } from "./RecordCounters";
import { RecordDetail } from "./RecordDetail";
import { SortableStrip } from "./SortableStrip";
import { useBuilderActions } from "./useBuilderActions";

function EmptyState({ onAdd, readOnly }: { onAdd(): void; readOnly: boolean }) {
  return (
    <section aria-label="Sin piezas" className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-divider p-10 text-center">
      <QrCode2Icon color="primary" sx={{ fontSize: 56 }} />
      <h2 className="m-0 text-lg font-semibold">Aún no hay piezas</h2>
      <p className="m-0 max-w-md text-muted">Agrega una pieza con el formulario o importa un Excel: cada fila se convierte en una pieza de 50 × 50 mm con su QR.</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="contained" onClick={onAdd} disabled={readOnly}>
          + Agregar nuevo
        </Button>
        <Button component={Link} href="/import" variant="outlined" startIcon={<UploadFileIcon />}>
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
  const exportable = useMemo(() => all.filter(isExportable).length, [all]);

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

  const onSubmit = async (draft: RecordDraft): Promise<boolean> => {
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
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando proyecto">
        <Skeleton variant="text" width={180} height={44} />
        <Skeleton variant="rectangular" height={56} />
        <Skeleton variant="rectangular" height={320} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PersistenceBanners actions={actions} />
      <BuilderToolbar actions={actions} total={all.length} exportable={exportable} onAdd={() => setEditing("new")} />

      {all.length === 0 ? (
        <EmptyState onAdd={() => setEditing("new")} readOnly={readOnly} />
      ) : (
        <>
          <RecordCounters onFilter={setFilter} />
          {visible.length === 0 ? (
            <p role="status" className="m-0 rounded-lg border border-divider p-6 text-center text-muted">
              Ninguna pieza coincide con el filtro o la búsqueda.{" "}
              <Button size="small" onClick={() => patchSession(runtime.session, { filter: "all", query: "" })}>
                Quitar filtros
              </Button>
            </p>
          ) : selection.view === "pages" && current ? (
            <>
              <RecordDetail record={current} position={index + 1} total={visible.length} readOnly={readOnly} actions={actions} onEdit={() => setEditing(current)} onMove={() => setMoving(current.id)} onPrevious={() => go(-1)} onNext={() => go(1)} />
              <h2 className="m-0 mt-2 text-base font-semibold">Todas las piezas</h2>
              <SortableStrip records={strip.items} offset={(strip.page - 1) * selection.pageSize} selectedId={current.id} customized={customized} readOnly={readOnly} reorderable={filter === "all" && query === ""} onReorder={(id, to) => actions.move(id, to)} {...handlers} />
              <Pagination page={strip.page} pages={strip.pages} onChange={setPage} label="Tira" />
            </>
          ) : (
            <>
              <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-label="Piezas">
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

      <RecordForm open={editing !== null} record={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSubmit={onSubmit} />
      <MoveToDialog open={moving !== null} label={moveRecord ? [moveRecord.mesa, moveRecord.area].filter(Boolean).join(" · ") : ""} current={moveIndex + 1} total={all.length} onClose={() => setMoving(null)} onMove={(to) => moving && actions.move(moving, to)} />
    </div>
  );
}
