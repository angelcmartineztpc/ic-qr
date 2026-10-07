"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DownloadIcon from "@mui/icons-material/Download";
import RedoIcon from "@mui/icons-material/Redo";
import UndoIcon from "@mui/icons-material/Undo";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useShallow } from "zustand/react/shallow";

import { describeLayoutWarning } from "@/lib/errors/messages.es";
import { layoutWarnings } from "@/lib/layout/warnings";
import { resolveLayout, isCustomized } from "@/lib/layout/resolve-layout";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useRuntime, useSession } from "@/lib/state/StoreProvider";
import { getTemplate } from "@/templates";

import { svgDataUrl, useTile } from "@/components/preview/useTile";
import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { TemplatePicker } from "./TemplatePicker";
import { useNotify } from "@/components/ui/NotificationsProvider";

import { CoordinatesPanel } from "./CoordinatesPanel";
import { FileNameInput } from "./FileNameInput";
import { LayoutEditor } from "./LayoutEditor";
import { PDFPreview } from "./PDFPreview";
import { PdfOptionsPanel } from "./PdfOptionsPanel";
import { OverlapAlert, QrPresetPicker, ScopeSwitch } from "./PositionControls";
import { TemplatePanel } from "./TemplatePanel";
import { useEditorActions } from "./useEditorActions";

function Section({ title, defaultExpanded = false, children }: { title: string; defaultExpanded?: boolean; children: React.ReactNode }) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters variant="outlined">
      <AccordionSummary expandIcon={<span aria-hidden>▾</span>}>
        <h3 className="m-0 text-base font-semibold">{title}</h3>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

/** Editor visual y salida final (/preview): ajusta la composición, elige las opciones del PDF y revisa las hojas. */
export function PreviewScreen() {
  const builder = useBuilderActions();
  const editor = useEditorActions();
  const notify = useNotify();
  const runtime = useRuntime();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const ui = useSession((s) => s.editor);
  const currentId = useSession((s) => s.selection.currentId);
  const excluded = useSession(useShallow((s) => s.excluded));
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const projectLayout = useProject((p) => p.layout);
  const templateId = useProject((p) => p.templateId);
  const templateOverrides = useProject((p) => p.templateOverrides);
  const exportOptions = useProject((p) => p.exportOptions);

  // Sin selección válida se muestra (y se edita) la primera pieza.
  const index = Math.max(0, records.findIndex((r) => r.id === currentId));
  const current = records[index];
  const template = getTemplate(templateId);
  const spec = useMemo(() => (template ? { width: template.tile.width, height: template.tile.height, safeMarginMm: template.tile.safeMarginMm } : null), [template]);
  const layout = current ? resolveLayout(projectLayout, current.id) : projectLayout.base;
  const { result: tileResult } = useTile(current);
  const exportCount = records.filter((r) => !excluded.includes(r.id)).length;

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
  if (!template || !spec) return <Alert severity="error">La plantilla «{templateId}» ya no existe. Elige otra en el Inicio.</Alert>;
  if (records.length === 0 || !current) {
    return (
      <section aria-label="Sin piezas" className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-divider p-10 text-center">
        <h2 className="m-0 text-lg font-semibold">Aún no hay piezas</h2>
        <p className="m-0 max-w-md text-muted">Agrega o importa piezas para ajustar su composición y generar el PDF.</p>
        <Button component={Link} href="/editor" variant="contained">Ir a las piezas</Button>
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
    <div className="flex flex-col gap-4">
      <PersistenceBanners actions={builder} />
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Editor">
        <Button component={Link} href="/editor" startIcon={<ArrowBackIcon />}>Volver a editar datos</Button>
        <span className="mx-1 text-muted" aria-hidden>|</span>
        <IconButton aria-label="Pieza anterior" onClick={() => go(-1)} disabled={index === 0}><ChevronLeftIcon /></IconButton>
        <span aria-live="polite" data-testid="piece-position">Pieza {index + 1} de {records.length}</span>
        <IconButton aria-label="Pieza siguiente" onClick={() => go(1)} disabled={index >= records.length - 1}><ChevronRightIcon /></IconButton>
        <TextField size="small" type="number" label="Ir a" className="w-24" slotProps={{ htmlInput: { min: 1, max: records.length } }} onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const n = Number((e.target as HTMLInputElement).value);
          const target = records[Math.min(records.length, Math.max(1, Math.trunc(n))) - 1];
          if (target) builder.select(target.id);
        }} />
        <span className="flex-1" />
        <Tooltip title="Deshacer (Ctrl/⌘ + Z)"><span><IconButton aria-label="Deshacer" onClick={() => editor.undo()} disabled={disabled || !canUndo}><UndoIcon /></IconButton></span></Tooltip>
        <Tooltip title="Rehacer (Mayús + Ctrl/⌘ + Z)"><span><IconButton aria-label="Rehacer" onClick={() => editor.redo()} disabled={disabled || !canRedo}><RedoIcon /></IconButton></span></Tooltip>
      </div>

      {disabled ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-label="Composición" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <FormControlLabel control={<Switch checked={ui.snap} onChange={(e) => editor.patchEditor({ snap: e.target.checked })} />} label="Imán" />
            <FormControlLabel control={<Switch checked={ui.showGrid} onChange={(e) => editor.patchEditor({ showGrid: e.target.checked })} />} label="Rejilla" />
            {ui.showGrid ? (
              <TextField select size="small" label="Cada" value={ui.gridMm} onChange={(e) => editor.patchEditor({ gridMm: Number(e.target.value) as 1 | 2 | 5 })} className="w-24">
                {[1, 2, 5].map((g) => (<MenuItem key={g} value={g}>{g} mm</MenuItem>))}
              </TextField>
            ) : null}
            {customized ? <span className="text-sm text-warning">Esta pieza tiene posición propia</span> : null}
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
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm" aria-label="Avisos de composición" data-testid="layout-warnings">
              {warnings.map((w, i) => (<li key={i} className="text-warning">⚠ {describeLayoutWarning(w)}</li>))}
            </ul>
          ) : null}
        </section>

        <aside aria-label="Ajustes" className="flex flex-col gap-3">
          <Section title="Posición" defaultExpanded>
            <div className="flex flex-col gap-3">
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
            <div className="flex flex-col gap-3">
              <TemplatePicker actions={builder} />
              <TemplatePanel template={template} overrides={templateOverrides} disabled={disabled} onChange={(next) => editor.setTemplateOverrides(next)} />
            </div>
          </Section>
          <Section title="PDF" defaultExpanded>
            <div className="flex flex-col gap-3">
              <FileNameInput value={exportOptions.fileName} disabled={disabled} onChange={(name) => editor.setFileName(name)} />
              <PdfOptionsPanel options={exportOptions.pdf} tile={template.tile} count={exportCount} disabled={disabled} onChange={(patch) => editor.setPdfOptions(patch)} />
            </div>
          </Section>
        </aside>
      </div>

      <section aria-label="Hojas" className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">Hojas del PDF</h2>
        <PDFPreview tile={template.tile} options={exportOptions.pdf} count={exportCount} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => void builder.downloadPieceSvg(current.id)}>Descargar SVG de esta pieza</Button>
        <Tooltip title="La generación del PDF llega con la exportación (Fase 9)">
          <span><Button variant="contained" startIcon={<DownloadIcon />} disabled data-testid="download-pdf">Descargar PDF</Button></span>
        </Tooltip>
      </div>
    </div>
  );
}
