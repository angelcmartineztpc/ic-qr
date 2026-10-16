import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";

import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, FormControlLabel, IconButton, MenuItem, Switch, TextField, Tooltip } from "@/components/qr-produccion/ui";

import { describeLayoutWarning } from "@/services/qr-produccion/errors/messages.es";
import { layoutWarnings } from "@/services/qr-produccion/layout/warnings";
import { resolveLayout, isCustomized } from "@/services/qr-produccion/layout/resolve-layout";
import { orderedRecords } from "@/services/qr-produccion/state/project";
import { useProject, useRuntime, useSession } from "@/services/qr-produccion/state/StoreProvider";
import { getTemplate } from "@/services/qr-produccion/templates";

import { svgDataUrl, useTile } from "@/components/qr-produccion/preview/useTile";
import { StepFooter } from "@/components/qr-produccion/layout/StepFooter";
import { PersistenceBanners } from "@/components/qr-produccion/records/PersistenceBanners";
import { useBuilderActions } from "@/components/qr-produccion/records/useBuilderActions";
import { TemplatePicker } from "./TemplatePicker";
import { useNotify } from "@/components/qr-produccion/layout/NotificationsProvider";
import styles from "./PreviewScreen.module.css";

import { CoordinatesPanel } from "./CoordinatesPanel";
import { LayoutEditor } from "./LayoutEditor";
import { OverlapAlert, QrPresetPicker, ScopeSwitch } from "./PositionControls";
import { TemplatePanel } from "./TemplatePanel";
import { useEditorActions } from "./useEditorActions";

function Section({ title, defaultExpanded = false, children }: { title: string; defaultExpanded?: boolean; children: React.ReactNode }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters variant="outlined" slotProps={{ heading: { component: "h2" } }}>
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <span className={styles.sectionTitle}>{title}</span>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

/** Editor visual y salida final (Diseño): ajusta la composición, elige las opciones del PDF y revisa las hojas. */
export function PreviewScreen() {
  const builder = useBuilderActions();
  const editor = useEditorActions();
  const notify = useNotify();
  const runtime = useRuntime();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const ui = useSession((s) => s.editor);
  const currentId = useSession((s) => s.selection.currentId);
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const projectLayout = useProject((p) => p.layout);
  const templateId = useProject((p) => p.templateId);
  const templateOverrides = useProject((p) => p.templateOverrides);

  // Sin selección válida se muestra (y se edita) la primera pieza.
  const index = Math.max(0, records.findIndex((r) => r.id === currentId));
  const current = records[index];
  const template = getTemplate(templateId);
  const spec = useMemo(() => (template ? { width: template.tile.width, height: template.tile.height, safeMarginMm: template.tile.safeMarginMm } : null), [template]);
  const layout = current ? resolveLayout(projectLayout, current.id) : projectLayout.base;
  const { result: tileResult } = useTile(current);

  const history = useSyncExternalStore(
    (listener) => runtime.history.subscribe(listener),
    () => `${runtime.history.canUndo}|${runtime.history.canRedo}`,
    () => "false|false",
  );
  const [canUndo, canRedo] = history.split("|").map((v) => v === "true");

  // Ctrl/Cmd + Z y Mayús + Ctrl/Cmd + Z (salvo mientras se escribe en un campo).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editor]);

  if (!hydrated) return <p role="status">Cargando…</p>;
  if (!template || !spec) return <Alert severity="error">La plantilla «{templateId}» ya no existe. Elige otra en la sección Plantilla.</Alert>;
  if (records.length === 0 || !current) {
    return (
      <section aria-label="Sin piezas" className={styles.empty}>
        <h2 className={styles.emptyTitle}>Aún no hay piezas</h2>
        <p className={styles.emptyText}>Agrega o importa piezas para ajustar su composición y generar el PDF.</p>
        <Button to="/qr-produccion" variant="contained">Ir a las piezas</Button>
      </section>
    );
  }

  const disabled = readOnly;
  const customized = isCustomized(projectLayout, current.id);
  const warnings = [...layoutWarnings(layout, spec), ...(tileResult?.warnings ?? [])].filter((w, i, all) => all.findIndex((o) => o.code === w.code && JSON.stringify(o) === JSON.stringify(w)) === i);
  const go = (delta: number) => {
    const next = records[Math.min(records.length - 1, Math.max(0, index + delta))];
    if (next) builder.select(next.id);
  };

  return (
    <div className={styles.root}>
      <PersistenceBanners actions={builder} showRestored={false} />
      <div className={styles.toolbar} role="toolbar" aria-label="Editor">
        <div className={styles.group}>
          <IconButton aria-label="Pieza anterior" onClick={() => go(-1)} disabled={index === 0}><ChevronLeft size={20} /></IconButton>
          <span aria-live="polite" data-testid="piece-position">Pieza {index + 1} de {records.length}</span>
          <IconButton aria-label="Pieza siguiente" onClick={() => go(1)} disabled={index >= records.length - 1}><ChevronRight size={20} /></IconButton>
          <TextField size="small" type="number" label="Ir a la pieza n.º" className={styles.goto} slotProps={{ htmlInput: { min: 1, max: records.length } }} onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const n = Number((e.target as HTMLInputElement).value);
            const target = records[Math.min(records.length, Math.max(1, Math.trunc(n))) - 1];
            if (target) builder.select(target.id);
          }} />
        </div>
        <span className={styles.separator} aria-hidden="true" />
        <div className={styles.group}>
          <Tooltip title="Deshacer (Ctrl/⌘ + Z)"><span><IconButton aria-label="Deshacer" onClick={() => editor.undo()} disabled={disabled || !canUndo}><Undo2 size={20} /></IconButton></span></Tooltip>
          <Tooltip title="Rehacer (Mayús + Ctrl/⌘ + Z)"><span><IconButton aria-label="Rehacer" onClick={() => editor.redo()} disabled={disabled || !canRedo}><Redo2 size={20} /></IconButton></span></Tooltip>
        </div>
        <span className={styles.spacer} />
        <Button variant="outlined" size="small" startIcon={<Download size={18} />} onClick={() => void builder.downloadPieceSvg(current.id)}>Descargar SVG de esta pieza</Button>
      </div>

      {disabled ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}

      <div className={styles.layout}>
        <section aria-label="Composición" className={styles.column}>
          <div className={styles.options}>
            <FormControlLabel control={<Switch checked={ui.snap} onChange={(e) => editor.patchEditor({ snap: e.target.checked })} />} label="Ajustar a las guías (imán)" />
            <FormControlLabel control={<Switch checked={ui.showGrid} onChange={(e) => editor.patchEditor({ showGrid: e.target.checked })} />} label="Rejilla" />
            {ui.showGrid ? (
              <TextField select size="small" label="Cada" value={ui.gridMm} onChange={(e) => editor.patchEditor({ gridMm: Number(e.target.value) as 1 | 2 | 5 })} className={styles.grid}>
                {[1, 2, 5].map((g) => (<MenuItem key={g} value={g}>{g} mm</MenuItem>))}
              </TextField>
            ) : null}
            {customized ? <span className={styles.badge}>Esta pieza tiene posición propia</span> : null}
          </div>
          <LayoutEditor
            tile={spec}
            layout={layout}
            imageUrl={tileResult ? svgDataUrl(tileResult.svg) : undefined}
            title={[current.mesa, current.area].filter(Boolean).join(" · ") || "la pieza"}
            selected={ui.box}
            showGrid={ui.showGrid}
            gridMm={ui.gridMm}
            snap={ui.snap}
            disabled={disabled}
            onSelect={(box) => editor.patchEditor({ box })}
            onCommit={(key, box) => editor.setBox(key, box)}
            onReject={(message) => notify({ message, severity: "warning", group: "records" })}
          />
          <OverlapAlert layout={layout} onFit={() => { const r = editor.fitContentAboveQr(); if (!r.ok) notify({ message: r.message, severity: "warning", group: "records" }); }} />
          {warnings.length > 0 ? (
            <ul className={styles.warnings} aria-label="Avisos de composición" data-testid="layout-warnings">
              {warnings.map((w, i) => (<li key={i} className={styles.warning}><AlertTriangle size={18} aria-hidden />{describeLayoutWarning(w)}</li>))}
            </ul>
          ) : null}
        </section>

        <aside aria-label="Ajustes" className={styles.column}>
          <Section title="Posición" defaultExpanded>
            <div className={styles.stack}>
              <ScopeSwitch
                scope={ui.scope}
                disabled={disabled}
                customized={customized}
                othersCustomized={editor.customized(ui.box).length}
                onScope={(scope) => editor.setScope(scope)}
                onReset={() => editor.resetPiece()}
                onApplyToCustomized={() => editor.applyToCustomized(ui.box)}
              />
              <QrPresetPicker layout={layout} tile={spec} disabled={disabled} onPreset={(preset) => editor.applyPreset(preset)} />
              <CoordinatesPanel layout={layout} box={ui.box} unit={ui.unit} disabled={disabled} onBox={(box) => editor.patchEditor({ box })} onUnit={(unit) => editor.patchEditor({ unit })} onCommit={(key, box) => editor.setBox(key, box)} />
            </div>
          </Section>
          <Section title="Plantilla">
            <div className={styles.stack}>
              <TemplatePicker actions={builder} />
              <TemplatePanel template={template} overrides={templateOverrides} disabled={disabled} onChange={(next) => editor.setTemplateOverrides(next)} />
            </div>
          </Section>
        </aside>
      </div>

      <StepFooter back={{ href: "/qr-produccion/estilo", label: "Estilo del QR" }} next={{ href: "/qr-produccion/exportar", label: "Siguiente: Exportar" }} />
    </div>
  );
}
