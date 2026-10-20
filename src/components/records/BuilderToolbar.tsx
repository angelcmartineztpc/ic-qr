"use client";

import ClearIcon from "@mui/icons-material/Clear";
import DownloadIcon from "@mui/icons-material/Download";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import SaveIcon from "@mui/icons-material/Save";
import SearchIcon from "@mui/icons-material/Search";
import SortIcon from "@mui/icons-material/Sort";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ViewCarouselIcon from "@mui/icons-material/ViewCarousel";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { useRef, useState } from "react";

import type { SortKey } from "@/lib/records/order";
import type { CounterFilter } from "@/lib/state/counters";
import { isDirty } from "@/lib/state/project";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession, type ViewMode } from "@/lib/state/stores";

import type { BuilderActions } from "./builder-actions";
import { QrCatalogBadge, RecordCounters } from "./RecordCounters";
import { StartOverDialog } from "./StartOverDialog";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "area", label: "Área" },
  { key: "estacion", label: "Estación" },
  { key: "mesa", label: "Mesa" },
  { key: "sourceRow", label: "Fila de Excel" },
];

function SaveStatus({ hasPieces }: { hasPieces: boolean }) {
  const status = useSession((s) => s.persistence.status);
  const dirty = useProject((p) => isDirty(p));
  if (!hasPieces && status !== "saving") return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-live="polite">
      {status === "saving" ? (
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-divider bg-background/70 px-3 text-xs font-medium text-muted">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          <span>Guardando…</span>
        </span>
      ) : status === "ok" && hasPieces ? (
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-divider bg-background/70 px-3 text-xs font-medium text-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
          <span>Guardado en este navegador</span>
        </span>
      ) : null}
      {dirty && hasPieces ? (
        <span data-testid="dirty-chip" className="sr-only">
          Cambios sin descargar
        </span>
      ) : null}
    </div>
  );
}

export interface BuilderToolbarProps {
  actions: BuilderActions;
  total: number;
  onAdd(): void;
  onFilter?: (filter: CounterFilter) => void;
  embedded?: boolean;
}

/** Barra de control de 2 niveles: Nivel 1 (Proyecto + Estado + Acciones principales) y Nivel 2 (Búsqueda + Filtros píldora + Catálogo QR + Vista). */
export function BuilderToolbar({ actions, total, onAdd, onFilter, embedded = false }: BuilderToolbarProps) {
  const runtime = useRuntime();
  const name = useProject((p) => p.name);
  const view = useSession((s) => s.selection.view);
  const query = useSession((s) => s.query);
  const readOnly = useSession((s) => s.writer === "read-only");
  const progress = useSession((s) => s.qrProgress);
  const pending = useSession((s) => s.inFlight.length);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [confirmStartOver, setConfirmStartOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => setMenu(null);
  const handleRequestNewProject = () => {
    if (total > 0) {
      setConfirmStartOver(true);
    } else {
      void actions.newProject({ confirmed: true });
    }
  };
  const pendingCount = actions.pendingIds().length;
  const handleFilter =
    onFilter ??
    ((next: CounterFilter) => patchSession(runtime.session, (s) => ({ filter: next, selection: { ...s.selection, page: 1 } })));

  return (
    <div
      className={
        embedded
          ? "flex flex-col"
          : "flex flex-col overflow-hidden rounded-xl border border-divider bg-surface shadow-xs"
      }
    >
      {/* NIVEL 1: Nombre del proyecto + Estado de guardado (Izquierda) | Acciones principales + Menú ⋯ (Derecha) */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5 max-sm:w-full">
          <TextField
            size="small"
            label="Nombre del proyecto"
            placeholder="Ej. Resort Cancún — Lote Terraza"
            value={name}
            onChange={(e) => actions.setName(e.target.value)}
            disabled={readOnly}
            className="w-full sm:!w-64 md:!w-72"
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <SaveStatus hasPieces={total > 0} />
        </div>

        <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end">
          {pendingCount > 0 && !progress.running ? (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              startIcon={<QrCode2Icon fontSize="small" />}
              onClick={() => void actions.generatePending()}
              disabled={readOnly}
              className="!rounded-full whitespace-nowrap"
            >
              Generar {pendingCount} QR {pendingCount === 1 ? "pendiente" : "pendientes"}
            </Button>
          ) : null}
          {total > 0 ? (
            <>
              <Button
                variant="contained"
                onClick={onAdd}
                disabled={readOnly}
                className="!rounded-full !px-4 whitespace-nowrap"
              >
                + Agregar nuevo
              </Button>
              <Button
                component={Link}
                href="/import"
                variant="outlined"
                startIcon={<UploadFileIcon fontSize="small" />}
                className="!rounded-full !px-3.5 whitespace-nowrap"
              >
                Importar Excel
              </Button>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<NoteAddOutlinedIcon fontSize="small" />}
                onClick={handleRequestNewProject}
                disabled={readOnly}
                className="!rounded-full !border-divider !bg-background/60 !px-3.5 whitespace-nowrap"
              >
                Nuevo proyecto
              </Button>
            </>
          ) : null}
          <Tooltip title="Más opciones del proyecto">
            <IconButton
              aria-label="Más opciones del proyecto"
              aria-haspopup="menu"
              onClick={(e) => setMenu(e.currentTarget)}
              className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-full !border !border-divider !bg-background/60"
            >
              <MoreHorizIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu anchorEl={menu} open={menu !== null} onClose={close}>
            <MenuItem
              onClick={() => {
                close();
                actions.saveProjectFile();
              }}
              disabled={total === 0}
            >
              <ListItemIcon>
                <SaveIcon fontSize="small" />
              </ListItemIcon>
              Guardar proyecto (.qrproj.json)
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                void actions.downloadExcel();
              }}
              disabled={total === 0}
            >
              <ListItemIcon>
                <DownloadIcon fontSize="small" />
              </ListItemIcon>
              Descargar Excel actualizado
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                fileInput.current?.click();
              }}
              disabled={readOnly}
            >
              <ListItemIcon>
                <FolderOpenIcon fontSize="small" />
              </ListItemIcon>
              Abrir proyecto…
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                close();
                handleRequestNewProject();
              }}
              disabled={readOnly}
              className="!font-medium !text-primary"
            >
              <ListItemIcon className="!text-primary">
                <NoteAddOutlinedIcon fontSize="small" />
              </ListItemIcon>
              Nuevo proyecto
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                close();
                void actions.generatePending();
              }}
              disabled={readOnly || pendingCount === 0}
            >
              Generar QR pendientes ({pendingCount})
            </MenuItem>
            <Divider />
            <ListSubheader>
              <SortIcon fontSize="inherit" className="mr-1 align-middle" /> Ordenar por…
            </ListSubheader>
            {SORTS.map((s) => (
              <MenuItem
                key={s.key}
                onClick={() => {
                  close();
                  void actions.sortBy(s.key);
                }}
                disabled={readOnly || total < 2}
              >
                {s.label}
              </MenuItem>
            ))}
          </Menu>
          <StartOverDialog
            open={confirmStartOver}
            projectName={name}
            pieceCount={total}
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
              if (file) void actions.openProjectFromFile(file);
            }}
          />
        </div>
      </div>

      {/* NIVEL 2: Barra de Herramientas Integrada (Búsqueda + Filtros píldora a la izquierda | Catálogo QR + Toggle de vista a la derecha) */}
      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-divider bg-background/40 px-4 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2.5 max-sm:w-full">
            <TextField
              size="small"
              label="Buscar pieza"
              placeholder="Mesa, área, estación…"
              type="search"
              value={query}
              onChange={(e) => patchSession(runtime.session, (s) => ({ query: e.target.value, selection: { ...s.selection, page: 1 } }))}
              className="!w-full sm:!w-56"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: query ? (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        aria-label="Limpiar búsqueda"
                        onClick={() => patchSession(runtime.session, (s) => ({ query: "", selection: { ...s.selection, page: 1 } }))}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                },
              }}
            />
            <RecordCounters onFilter={handleFilter} embedded showCatalog={false} />
          </div>

          <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-between">
            <QrCatalogBadge />
            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_e, next: ViewMode | null) => next && patchSession(runtime.session, (s) => ({ selection: { ...s.selection, view: next } }))}
              aria-label="Vista"
            >
              <ToggleButton value="pages" aria-label="Una por una: una pieza por pantalla">
                <ViewCarouselIcon fontSize="small" /> <span className="ml-1 hidden sm:inline">Una por una</span>
              </ToggleButton>
              <ToggleButton value="grid" aria-label="Todas: todas las piezas en cuadrícula">
                <ViewModuleIcon fontSize="small" /> <span className="ml-1 hidden sm:inline">Todas</span>
              </ToggleButton>
            </ToggleButtonGroup>
          </div>
        </div>
      ) : null}

      {progress.running || pending > 0 ? (
        <div role="status" className="flex items-center gap-3 border-t border-divider px-4 py-2 sm:px-5" data-testid="qr-progress">
          <LinearProgress
            className="grow"
            variant={progress.total > 0 ? "determinate" : "indeterminate"}
            value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
            aria-label="Progreso de QR"
          />
          <span className="whitespace-nowrap text-sm text-muted tabular-nums">
            Generando QR {progress.done}/{progress.total || pending}
          </span>
          <Button size="small" onClick={actions.cancelQr}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

