"use client";

import EditNoteIcon from "@mui/icons-material/EditNote";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { summarizeQrCatalog } from "@/lib/qr/shared-catalog";
import { matchesFilter, matchesQuery, paginate, type CounterFilter } from "@/lib/state/counters";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession } from "@/lib/state/stores";
import type { QRRecord, RecordDraft } from "@/types";

import { RecordForm } from "@/components/forms/RecordForm";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { StepFooter } from "@/components/ui/StepFooter";
import { ViewTransitionStage, runViewTransition } from "@/components/ui/ViewTransition";

import { BuilderToolbar } from "./BuilderToolbar";
import type { BuilderActions } from "./builder-actions";
import { MoveToDialog } from "./MoveToDialog";
import { PersistenceBanners } from "./PersistenceBanners";
import { RecordCard } from "./RecordCard";
import { RecordDetail } from "./RecordDetail";
import { SortableStrip } from "./SortableStrip";
import { useBuilderActions } from "./useBuilderActions";

function BuilderEmptyState({ onAdd, readOnly, actions }: { onAdd(): void; readOnly: boolean; actions: BuilderActions }) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <EmptyState.Root aria-label="Sin piezas">
      <EmptyState.Visual>
        <QrCode2Icon sx={{ fontSize: 32 }} />
      </EmptyState.Visual>

      <EmptyState.Header>
        <EmptyState.Title>Aún no hay piezas</EmptyState.Title>
        <EmptyState.Description>
          Elige cómo quieres armar tu lote de producción. Cada pieza genera una mesa de trabajo vectorial de 70 × 70 mm con código QR reutilizable.
        </EmptyState.Description>
      </EmptyState.Header>

      <EmptyState.Benefits>
        <EmptyState.BenefitItem>Arte vectorial 70 × 70 mm</EmptyState.BenefitItem>
        <EmptyState.BenefitItem>QR corto generado al guardar</EmptyState.BenefitItem>
        <EmptyState.BenefitItem>Vista previa vectorial en vivo</EmptyState.BenefitItem>
      </EmptyState.Benefits>

      <div className="mt-2 grid w-full max-w-2xl grid-cols-1 gap-3.5 text-left sm:grid-cols-2">
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-divider bg-background/60 p-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-primary">
              <EditNoteIcon fontSize="small" />
              <span className="text-xs font-semibold uppercase tracking-wider">Captura manual</span>
            </div>
            <strong className="text-base font-bold text-foreground">Crear pieza por pieza</strong>
            <p className="m-0 text-xs leading-relaxed text-muted">
              Ideal para lotes pequeños o pruebas rápidas. Captura Área, Mesa y Link del menú con vista previa en vivo.
            </p>
          </div>
          <EmptyState.PrimaryAction>
            <Button variant="contained" size="large" fullWidth onClick={onAdd} disabled={readOnly}>
              + Agregar nuevo
            </Button>
          </EmptyState.PrimaryAction>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-xl border border-divider bg-background/60 p-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-primary">
              <UploadFileIcon fontSize="small" />
              <span className="text-xs font-semibold uppercase tracking-wider">Producción masiva</span>
            </div>
            <strong className="text-base font-bold text-foreground">Cargar listado Excel o CSV</strong>
            <p className="m-0 text-xs leading-relaxed text-muted">
              Convierte decenas o cientos de filas en placas listas para imprenta, validando errores y duplicados.
            </p>
          </div>
          <div className="flex w-full">
            <Button component={Link} href="/import" variant="outlined" size="large" fullWidth startIcon={<UploadFileIcon />}>
              Importar Excel
            </Button>
          </div>
        </div>
      </div>

      <EmptyState.SecondaryActions label="¿Ya tienes un proyecto guardado en tu equipo?">
        <Button variant="text" size="small" color="inherit" startIcon={<FolderOpenIcon fontSize="small" />} onClick={() => fileInput.current?.click()} disabled={readOnly}>
          Abrir archivo de proyecto (.qrproj.json)
        </Button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".qrproj.json,.json,application/json"
          data-testid="open-project-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void actions.openProjectFromFile(file);
          }}
        />
      </EmptyState.SecondaryActions>
    </EmptyState.Root>
  );
}

/** Document builder (spec §12): navegar, editar, duplicar, eliminar, agregar y reordenar piezas. */
export function EditorScreen() {
  const runtime = useRuntime();
  const actions = useBuilderActions();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const autoOpenNewPiece = useSession((s) => s.autoOpenNewPiece);
  const selection = useSession((s) => s.selection);
  const filter = useSession((s) => s.filter);
  const query = useSession((s) => s.query);
  const excluded = useSession(useShallow((s) => s.excluded));
  const order = useProject(useShallow((p) => p.order));
  const recordsById = useProject((p) => p.recordsById);
  const overrides = useProject((p) => p.layout.overrides);

  const [editing, setEditing] = useState<QRRecord | "new" | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const activeEditing: QRRecord | "new" | null = editing ?? (hydrated && autoOpenNewPiece && !readOnly ? "new" : null);
  const closeEditing = () => {
    setEditing(null);
    if (autoOpenNewPiece) patchSession(runtime.session, { autoOpenNewPiece: false });
  };

  const all = useMemo(() => order.flatMap((id) => (recordsById[id] ? [recordsById[id] as QRRecord] : [])), [order, recordsById]);
  const catalog = useMemo(() => summarizeQrCatalog(all), [all]);
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
    const draft = await actions.prepareDraft(rawDraft, activeEditing && activeEditing !== "new" ? activeEditing : undefined);
    if (!draft) return false;
    if (activeEditing === "new") {
      patchSession(runtime.session, { filter: "all", query: "", autoOpenNewPiece: false }); // que la pieza nueva sea visible
      const wasEmpty = all.length === 0;
      if (wasEmpty) {
        await new Promise<void>((resolve) => {
          runViewTransition(() => {
            void actions.add(draft).then(() => resolve());
          });
        });
      } else {
        await actions.add(draft);
      }
      return true;
    }
    return activeEditing ? actions.save(activeEditing.id, draft) : false;
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

      <ViewTransitionStage name="workspace-stage" className="flex flex-col gap-4">
        {all.length === 0 ? (
          <BuilderEmptyState onAdd={() => setEditing("new")} readOnly={readOnly} actions={actions} />
        ) : (
          <>
            <div className="flex flex-col overflow-hidden rounded-xl border border-divider bg-surface shadow-xs">
              <BuilderToolbar actions={actions} total={all.length} onAdd={() => setEditing("new")} onFilter={setFilter} embedded />
            </div>
            {visible.length === 0 ? (
              <p role="status" className="m-0 rounded-xl border border-divider bg-surface p-6 text-center text-muted">
                Ninguna pieza coincide con el filtro o la búsqueda.{" "}
                <Button size="small" onClick={() => patchSession(runtime.session, { filter: "all", query: "" })}>
                  Quitar filtros
                </Button>
              </p>
            ) : selection.view === "pages" && current ? (
              <>
                <RecordDetail
                  record={current}
                  position={index + 1}
                  total={visible.length}
                  readOnly={readOnly}
                  actions={actions}
                  catalog={catalog}
                  onEdit={() => setEditing(current)}
                  onMove={() => setMoving(current.id)}
                  onPrevious={() => go(-1)}
                  onNext={() => go(1)}
                />
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="m-0 text-base font-semibold">Todas las piezas</h2>
                  <span className="text-xs text-muted">
                    {filter === "all" && query === ""
                      ? "Haz clic para inspeccionar · Doble clic para editar · Arrastra para cambiar el orden en el pliego"
                      : `Mostrando ${visible.length} de ${all.length} piezas`}
                  </span>
                </div>
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
      </ViewTransitionStage>

      <StepFooter
        shortcut={{ href: "/export", label: "Ir directo a Exportar", disabled: all.length === 0 || withErrors > 0 }}
        next={{ href: "/style", label: "Siguiente: Estilo del QR", disabled: all.length === 0 }}
        {...(all.length === 0 ? { note: "Agrega al menos una pieza para continuar" } : withErrors > 0 ? { note: `${withErrors} ${withErrors === 1 ? "pieza tiene" : "piezas tienen"} errores: corrígelas antes de exportar` } : {})}
      />

      <RecordForm open={activeEditing !== null} record={activeEditing === "new" ? null : activeEditing} onClose={closeEditing} onSubmit={onSubmit} />
      <MoveToDialog open={moving !== null} label={moveRecord ? [moveRecord.mesa, moveRecord.area].filter(Boolean).join(" · ") : ""} current={moveIndex + 1} total={all.length} onClose={() => setMoving(null)} onMove={(to) => moving && actions.move(moving, to)} />
    </div>
  );
}

