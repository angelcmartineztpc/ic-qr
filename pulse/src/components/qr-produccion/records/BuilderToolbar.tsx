import { Download, EllipsisVertical, FileUp, FolderOpen, GalleryHorizontal, LayoutGrid, Save, Search, ArrowUpDown } from "lucide-react";
import { useRef, useState } from "react";

import { Button, Chip, Divider, IconButton, InputAdornment, LinearProgress, ListItemIcon, ListSubheader, Menu, MenuItem, TextField, ToggleButton, ToggleButtonGroup } from "@/components/qr-produccion/ui";
import type { SortKey } from "@/services/qr-produccion/records/order";
import { isDirty } from "@/services/qr-produccion/state/project";
import { useProject, useRuntime, useSession } from "@/services/qr-produccion/state/StoreProvider";
import { patchSession, type ViewMode } from "@/services/qr-produccion/state/stores";

import type { BuilderActions } from "./builder-actions";
import styles from "./BuilderToolbar.module.css";

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
    <div className={styles.status} aria-live="polite">
      {status === "saving" ? <Chip size="small" label="Guardando…" /> : status === "ok" ? <Chip size="small" variant="outlined" label="Guardado en este navegador" /> : null}
      {dirty ? <Chip size="small" color="warning" variant="outlined" label="Cambios sin descargar" data-testid="dirty-chip" /> : null}
    </div>
  );
}

export interface BuilderToolbarProps {
  actions: BuilderActions;
  total: number;
  onAdd(): void;
}

/** Barra del primer paso: proyecto, + Agregar nuevo, Importar Excel, búsqueda y vista. «Siguiente» vive en el pie del paso. */
export function BuilderToolbar({ actions, total, onAdd }: BuilderToolbarProps) {
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
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <TextField size="small" label="Nombre del proyecto" value={name} onChange={(e) => actions.setName(e.target.value)} disabled={readOnly} className={styles.name} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <div className={styles.saveStatus}>
          <SaveStatus />
        </div>
        <span className={styles.spacer} />
        <Button variant="contained" onClick={onAdd} disabled={readOnly} className={styles.action}>
          + Agregar nuevo
        </Button>
        <Button to="/qr-produccion/importar" variant="outlined" startIcon={<FileUp size={18} />} className={styles.action}>
          Importar Excel
        </Button>
        <IconButton aria-label="Más opciones del proyecto" aria-haspopup="menu" className={styles.more} onClick={(e) => setMenu(e.currentTarget)}>
          <EllipsisVertical size={20} />
        </IconButton>
        <Menu anchorEl={menu} open={menu !== null} onClose={close}>
          <MenuItem
            onClick={() => {
              close();
              actions.saveProjectFile();
            }}
            disabled={total === 0}
          >
            <ListItemIcon>
              <Save size={18} />
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
              <Download size={18} />
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
              <FolderOpen size={18} />
            </ListItemIcon>
            Abrir proyecto…
          </MenuItem>
          <MenuItem
            onClick={() => {
              close();
              void actions.newProject();
            }}
            disabled={readOnly}
          >
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
            <ArrowUpDown size={14} className={styles.sortIcon} aria-hidden /> Ordenar por…
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

      <div className={styles.searchRow}>
        <TextField
          size="small"
          label="Buscar pieza"
          type="search"
          value={query}
          onChange={(e) => patchSession(runtime.session, (s) => ({ query: e.target.value, selection: { ...s.selection, page: 1 } }))}
          className={styles.search}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            },
          }}
        />
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, next: ViewMode | null) => next && patchSession(runtime.session, (s) => ({ selection: { ...s.selection, view: next } }))} aria-label="Vista">
          <ToggleButton value="pages" aria-label="Una por una: una pieza por pantalla">
            <GalleryHorizontal size={18} /> <span className={styles.viewLabel}>Una por una</span>
          </ToggleButton>
          <ToggleButton value="grid" aria-label="Todas: todas las piezas en cuadrícula">
            <LayoutGrid size={18} /> <span className={styles.viewLabel}>Todas</span>
          </ToggleButton>
        </ToggleButtonGroup>
      </div>

      {progress.running || pending > 0 ? (
        <div role="status" className={styles.progress} data-testid="qr-progress">
          <LinearProgress className={styles.bar} variant={progress.total > 0 ? "determinate" : "indeterminate"} value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0} aria-label="Progreso de QR" />
          <span className={styles.progressText}>
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
