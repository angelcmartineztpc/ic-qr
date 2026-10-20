"use client";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import EditNoteIcon from "@mui/icons-material/EditNote";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { countRecords } from "@/lib/state/counters";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession } from "@/lib/state/stores";

import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { STEPS } from "@/components/ui/steps";
import { ViewTransitionStage, runViewTransition } from "@/components/ui/ViewTransition";

import { PersistenceBanners } from "./PersistenceBanners";
import { StartOverDialog } from "./StartOverDialog";
import { useBuilderActions } from "./useBuilderActions";

/** Inicio: First-Use Empty State (Material Design 3) cuando no hay proyecto, o tarjeta de continuación cuando ya existe uno. */
export function DashboardPanel() {
  const runtime = useRuntime();
  const actions = useBuilderActions();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const name = useProject((p) => p.name);
  const counts = useMemo(() => countRecords(records), [records]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [draggingProject, setDraggingProject] = useState(false);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const hasProject = hydrated && records.length > 0;

  const handleOpenFile = (file: File | undefined) => {
    if (!file) return;
    runViewTransition(() => {
      void actions.openProjectFromFile(file);
    });
  };

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="Cargando proyecto">
        <Skeleton variant="rounded" height={148} className="!rounded-2xl" />
        <Skeleton variant="rounded" height={240} className="!rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PersistenceBanners actions={actions} />

      <ViewTransitionStage name="workspace-stage" className="flex flex-col gap-5">
        {hasProject ? (
          <>

            <Panel title="Retoma tu proyecto" label="Proyecto actual" className="rounded-t-2xl rounded-b-xl bg-surface-subtle/50">
              <div data-testid="continue-card" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <p className="m-0 truncate text-xl font-semibold text-foreground">{name || "Proyecto en curso"}</p>
                      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 text-xs font-medium text-muted">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                        <span>Guardado en este navegador</span>
                      </span>
                    </div>
                    <p className="m-0 text-sm text-muted tabular-nums">
                      {counts.total} {counts.total === 1 ? "pieza" : "piezas"} · {counts.withQr} con QR · {counts.needQr} necesitan QR
                      {counts.withErrors > 0 ? ` · ${counts.withErrors} con errores` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outlined"
                      color="primary"
                      size="small"
                      startIcon={<NoteAddOutlinedIcon fontSize="small" />}
                      onClick={() => setConfirmStartOver(true)}
                      disabled={readOnly}
                      className="!rounded-full !px-3.5"
                    >
                      + Nuevo proyecto
                    </Button>
                    <Button variant="outlined" color="inherit" size="small" startIcon={<SaveAltIcon />} onClick={() => actions.saveProjectFile()} className="!rounded-full !border-divider !bg-surface !px-3.5">
                      Guardar (.qrproj)
                    </Button>
                    <Button component={Link} href={"/editor" as Route} variant="contained" size="large" endIcon={<ArrowForwardIcon />} className="!rounded-full !px-5">
                      Continuar
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">Ir directo al paso:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {STEPS.map((step, idx) => (
                      <Button
                        key={step.id}
                        component={Link}
                        href={step.href}
                        size="small"
                        variant="outlined"
                        color="inherit"
                        className="!rounded-full !border-divider !bg-surface !px-3"
                      >
                        {idx + 1}. {step.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>


            <Panel
              title="Alimentar lote o cambiar de proyecto"
              description="Selecciona la acción requerida para continuar con la preparación del lote."
            >
              <div className="overflow-hidden rounded-xl border border-divider bg-surface shadow-sm divide-y divide-divider">
                {/* Fila 1: Manual */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/[0.02]">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                      <EditNoteIcon fontSize="small" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">Agregar pieza al lote</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Captura manual</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">Abre el formulario para ingresar Área, Mesa y Link en un paso.</p>
                    </div>
                  </div>
                  <Button
                    component={Link}
                    href={"/editor" as Route}
                    variant="contained"
                    size="small"
                    onClick={() => patchSession(runtime.session, { autoOpenNewPiece: true })}
                    className="!rounded-full !px-4 !py-1.5 !text-xs !font-semibold !bg-primary !text-white shadow-none hover:!shadow"
                  >
                    + Agregar nueva pieza
                  </Button>
                </div>

                {/* Fila 2: Importar Excel */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/[0.02]">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" aria-hidden="true">
                      <UploadFileIcon fontSize="small" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">Importar desde Excel o CSV</span>
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">Masivo</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">Suma filas a tu proyecto existente o reemplaza el lote completo con una hoja de cálculo.</p>
                    </div>
                  </div>
                  <Button
                    component={Link}
                    href={"/import" as Route}
                    variant="outlined"
                    size="small"
                    startIcon={<UploadFileIcon fontSize="small" />}
                    className="!rounded-full !px-4 !py-1.5 !text-xs !font-semibold !border-primary !text-primary hover:!bg-primary/5"
                  >
                    Importar Excel
                  </Button>
                </div>

                {/* Fila 3: Archivo .qrproj */}
                <div
                  onDragOver={(e) => {
                    if (readOnly) return;
                    e.preventDefault();
                    setDraggingProject(true);
                  }}
                  onDragLeave={() => setDraggingProject(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDraggingProject(false);
                    if (readOnly) return;
                    handleOpenFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex flex-wrap items-center justify-between gap-3 p-4 transition-colors ${
                    draggingProject ? "bg-primary/10" : "hover:bg-muted/[0.02]"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary" aria-hidden="true">
                      <FolderOpenIcon fontSize="small" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">Abrir proyecto guardado (.qrproj.json)</span>
                        <span className="rounded bg-secondary/10 px-1.5 py-0.5 text-[10px] font-bold text-secondary">Archivo</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">Restaura tus piezas, estilo y plantilla. También puedes arrastrar el archivo directamente aquí.</p>
                    </div>
                  </div>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<FolderOpenIcon fontSize="small" />}
                    onClick={() => fileInput.current?.click()}
                    disabled={readOnly}
                    className="!rounded-full !px-4 !py-1.5 !text-xs !font-semibold"
                  >
                    Abrir archivo…
                  </Button>
                </div>
              </div>
            </Panel>
          </>
        ) : (
          <EmptyState.Root
            aria-label="Primer proyecto"
            data-testid="first-use-empty-state"
            onDragOver={(e) => {
              if (readOnly) return;
              e.preventDefault();
              setDraggingProject(true);
            }}
            onDragLeave={() => setDraggingProject(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingProject(false);
              if (readOnly) return;
              handleOpenFile(e.dataTransfer.files?.[0]);
            }}
            className={draggingProject ? "border-primary bg-primary/[0.03]" : ""}
          >
            <EmptyState.Visual>
              <QrCode2Icon sx={{ fontSize: 32 }} />
            </EmptyState.Visual>

            <EmptyState.Header>
              <EmptyState.Title>Crea tu primer proyecto de placas QR</EmptyState.Title>
              <EmptyState.Description>
                Genera piezas de producción de 70 × 70 mm con código QR vectorial y tipografía en contornos, listas para Illustrator e imprenta. Empieza agregando tu primera pieza en un clic.
              </EmptyState.Description>
            </EmptyState.Header>

            <EmptyState.Benefits>
              <EmptyState.BenefitItem>Placa vectorial 70 × 70 mm</EmptyState.BenefitItem>
              <EmptyState.BenefitItem>Texto en contornos sin fuentes externas</EmptyState.BenefitItem>
              <EmptyState.BenefitItem>Link corto editable sin reimprimir</EmptyState.BenefitItem>
            </EmptyState.Benefits>

            <EmptyState.PrimaryAction>
              <Button
                component={Link}
                href={"/editor" as Route}
                variant="contained"
                size="large"
                onClick={() => patchSession(runtime.session, { autoOpenNewPiece: true })}
              >
                + Agregar nuevo
              </Button>
            </EmptyState.PrimaryAction>

            <EmptyState.SecondaryActions label="¿Ya tienes una hoja de datos o un archivo de proyecto?">
              <Button component={Link} href={"/import" as Route} variant="outlined" startIcon={<UploadFileIcon />}>
                Importar Excel
              </Button>
              <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={() => fileInput.current?.click()} disabled={readOnly}>
                Abrir proyecto…
              </Button>
            </EmptyState.SecondaryActions>
          </EmptyState.Root>
        )}
      </ViewTransitionStage>

      <StartOverDialog
        open={confirmStartOver}
        projectName={name}
        pieceCount={counts.total}
        onClose={() => setConfirmStartOver(false)}
        onSaveBackup={() => actions.saveProjectFile()}
        onConfirm={() => {
          setConfirmStartOver(false);
          void actions.newProject({ confirmed: true });
        }}
      />

      <input
        ref={fileInput}
        type="file"
        hidden
        accept=".qrproj.json,.json,application/json"
        data-testid="open-project-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          handleOpenFile(file);
        }}
      />
    </div>
  );
}
