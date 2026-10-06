"use client";

import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SaveIcon from "@mui/icons-material/Save";
import SearchIcon from "@mui/icons-material/Search";
import SortIcon from "@mui/icons-material/Sort";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ViewCarouselIcon from "@mui/icons-material/ViewCarousel";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import Link from "next/link";
import { useRef, useState } from "react";

import type { SortKey } from "@/lib/records/order";
import { isDirty } from "@/lib/state/project";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { patchSession, type ViewMode } from "@/lib/state/stores";

import type { BuilderActions } from "./builder-actions";

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "area", label: "Área" },
  { key: "estacion", label: "Estación" },
  { key: "mesa", label: "Mesa" },
  { key: "sourceRow", label: "Fila de Excel" },
];

function SaveStatus() {
  const status = useSession((s) => s.persistence.status);
  const dirty = useProject((p) => isDirty(p));
  return (
    <div className="flex flex-wrap gap-1.5" aria-live="polite">
      {status === "saving" ? <Chip size="small" label="Guardando…" /> : status === "ok" ? <Chip size="small" variant="outlined" label="Guardado en este navegador" /> : null}
      {dirty ? <Chip size="small" color="warning" variant="outlined" label="Cambios sin exportar" data-testid="dirty-chip" /> : null}
    </div>
  );
}

export interface BuilderToolbarProps {
  actions: BuilderActions;
  total: number;
  exportable: number;
  onAdd(): void;
}

/** Barra del builder (spec §12): Piezas · + Agregar nuevo · Importar Excel · Generar PDF + proyecto y vista. */
export function BuilderToolbar({ actions, total, exportable, onAdd }: BuilderToolbarProps) {
  const runtime = useRuntime();
  const name = useProject((p) => p.name);
  const view = useSession((s) => s.selection.view);
  const query = useSession((s) => s.query);
  const readOnly = useSession((s) => s.writer === "read-only");
  const progress = useSession((s) => s.qrProgress);
  const pending = useSession((s) => s.inFlight.length);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => setMenu(null);
  const pendingCount = actions.pendingIds().length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 mr-auto text-2xl font-bold">Piezas</h1>
        <Button variant="contained" onClick={onAdd} disabled={readOnly}>
          + Agregar nuevo
        </Button>
        <Button component={Link} href="/import" variant="outlined" startIcon={<UploadFileIcon />}>
          Importar Excel
        </Button>
        <Button component={Link} href="/preview" variant="outlined" startIcon={<PictureAsPdfIcon />} disabled={total === 0} title={exportable < total ? `${total - exportable} pieza(s) aún no están listas para exportar` : undefined}>
          Generar PDF
        </Button>
        <IconButton aria-label="Más opciones del proyecto" aria-haspopup="menu" onClick={(e) => setMenu(e.currentTarget)}>
          <MoreVertIcon />
        </IconButton>
        <Menu anchorEl={menu} open={menu !== null} onClose={close}>
          <MenuItem onClick={() => { close(); actions.saveProjectFile(); }} disabled={total === 0}>
            <ListItemIcon><SaveIcon fontSize="small" /></ListItemIcon>
            Guardar proyecto (.qrproj.json)
          </MenuItem>
          <MenuItem onClick={() => { close(); fileInput.current?.click(); }} disabled={readOnly}>
            <ListItemIcon><FolderOpenIcon fontSize="small" /></ListItemIcon>
            Abrir proyecto…
          </MenuItem>
          <MenuItem onClick={() => { close(); void actions.newProject(); }} disabled={readOnly}>Nuevo proyecto</MenuItem>
          <Divider />
          <MenuItem onClick={() => { close(); void actions.generatePending(); }} disabled={readOnly || pendingCount === 0}>
            Generar QR pendientes ({pendingCount})
          </MenuItem>
          <Divider />
          <ListSubheader>
            <SortIcon fontSize="inherit" className="mr-1 align-middle" /> Ordenar por…
          </ListSubheader>
          {SORTS.map((s) => (
            <MenuItem key={s.key} onClick={() => { close(); void actions.sortBy(s.key); }} disabled={readOnly || total < 2}>
              {s.label}
            </MenuItem>
          ))}
        </Menu>
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

      <div className="flex flex-wrap items-center gap-3">
        <TextField
          size="small"
          label="Nombre del proyecto"
          value={name}
          onChange={(e) => actions.setName(e.target.value)}
          disabled={readOnly}
          className="!w-full sm:!w-64"
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
        <TextField
          size="small"
          label="Buscar pieza"
          type="search"
          value={query}
          onChange={(e) => patchSession(runtime.session, (s) => ({ query: e.target.value, selection: { ...s.selection, page: 1 } }))}
          className="!w-full sm:!w-56"
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
        />
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, next: ViewMode | null) => next && patchSession(runtime.session, (s) => ({ selection: { ...s.selection, view: next } }))} aria-label="Vista">
          <ToggleButton value="pages" aria-label="Vista de páginas"><ViewCarouselIcon fontSize="small" /> <span className="ml-1 hidden sm:inline">Páginas</span></ToggleButton>
          <ToggleButton value="grid" aria-label="Vista de rejilla"><ViewModuleIcon fontSize="small" /> <span className="ml-1 hidden sm:inline">Rejilla</span></ToggleButton>
        </ToggleButtonGroup>
        <div className="ml-auto"><SaveStatus /></div>
      </div>

      {progress.running || pending > 0 ? (
        <div role="status" className="flex items-center gap-3" data-testid="qr-progress">
          <LinearProgress className="grow" variant={progress.total > 0 ? "determinate" : "indeterminate"} value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0} aria-label="Progreso de QR" />
          <span className="whitespace-nowrap text-sm text-muted">Generando QR {progress.done}/{progress.total || pending}</span>
          <Button size="small" onClick={actions.cancelQr}>Cancelar</Button>
        </div>
      ) : null}
    </div>
  );
}
