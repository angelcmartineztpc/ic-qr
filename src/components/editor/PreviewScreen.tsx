"use client";

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RedoIcon from "@mui/icons-material/Redo";
import UndoIcon from "@mui/icons-material/Undo";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { StepFooter } from "@/components/ui/StepFooter";
import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { TemplatePicker } from "./TemplatePicker";
import { useNotify } from "@/components/ui/NotificationsProvider";

import { CoordinatesPanel } from "./CoordinatesPanel";
import { LayoutEditor } from "./LayoutEditor";
import { OverlapAlert, QrPresetPicker, ScopeSwitch } from "./PositionControls";
import { TemplatePanel } from "./TemplatePanel";
import { useEditorActions } from "./useEditorActions";

function Section({ title, defaultExpanded = false, children }: { title: string; defaultExpanded?: boolean; children: React.ReactNode }) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      variant="outlined"
      className="!overflow-hidden !rounded-xl !border-divider !bg-surface shadow-2xs before:!hidden"
      slotProps={{ heading: { component: "h2" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} className="border-b border-divider/60 bg-surface-subtle/50">
        <span className="text-sm font-semibold">{title}</span>
      </AccordionSummary>
      <AccordionDetails className="!p-4">{children}</AccordionDetails>
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
      <EmptyState.Root aria-label="Sin piezas">
        <EmptyState.Header>
          <EmptyState.Title>Aún no hay piezas</EmptyState.Title>
          <EmptyState.Description>Agrega o importa piezas en el primer paso para ajustar su composición y generar el PDF.</EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.PrimaryAction>
          <Button component={Link} href="/editor" variant="contained" className="!rounded-full !px-5">
            Ir a las piezas
          </Button>
        </EmptyState.PrimaryAction>
      </EmptyState.Root>
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
      <PersistenceBanners actions={builder} showRestored={false} />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-divider bg-surface px-4 py-2.5 shadow-2xs" role="toolbar" aria-label="Editor">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-9 items-center gap-1 rounded-full border border-divider bg-background/60 px-1.5">
            <IconButton size="small" aria-label="Pieza anterior" onClick={() => go(-1)} disabled={index === 0}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <span aria-live="polite" className="px-1.5 text-sm font-semibold tabular-nums" data-testid="piece-position">
              Pieza {index + 1} de {records.length}
            </span>
            <IconButton size="small" aria-label="Pieza siguiente" onClick={() => go(1)} disabled={index >= records.length - 1}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </div>
          <TextField
            size="small"
            type="number"
            label="Ir a la pieza n.º"
            placeholder={`1–${records.length}`}
            className="w-32"
            slotProps={{ htmlInput: { min: 1, max: records.length } }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const n = Number((e.target as HTMLInputElement).value);
              if (!Number.isFinite(n) || n < 1) return;
              const target = records[Math.min(records.length, Math.max(1, Math.trunc(n))) - 1];
              if (target) builder.select(target.id);
            }}
            onBlur={(e) => {
              if (!e.target.value) return;
              const n = Number(e.target.value);
              if (!Number.isFinite(n) || n < 1) return;
              const target = records[Math.min(records.length, Math.max(1, Math.trunc(n))) - 1];
              if (target) builder.select(target.id);
            }}
          />
        </div>
        <span className="min-h-6 w-px self-stretch bg-divider" aria-hidden="true" />
        <div className="flex items-center gap-1.5">
          <Tooltip title="Deshacer (Ctrl/⌘ + Z)">
            <span>
              <IconButton
                size="small"
                aria-label="Deshacer"
                onClick={() => editor.undo()}
                disabled={disabled || !canUndo}
                className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-lg !border !border-divider !bg-background/60"
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Rehacer (Mayús + Ctrl/⌘ + Z)">
            <span>
              <IconButton
                size="small"
                aria-label="Rehacer"
                onClick={() => editor.redo()}
                disabled={disabled || !canRedo}
                className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-lg !border !border-divider !bg-background/60"
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </div>
        <span className="flex-1" />
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon fontSize="small" />}
          onClick={() => void builder.downloadPieceSvg(current.id)}
          className="!rounded-full !px-3.5"
        >
          Descargar SVG de esta pieza
        </Button>
      </div>

      {disabled ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_24.5rem]">
        <section aria-label="Composición" className="flex flex-col gap-3">
          <div className="flex flex-col overflow-hidden rounded-t-2xl rounded-b-xl border border-divider bg-surface shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-background/60 px-4 py-2">
              <div className="flex flex-wrap items-center gap-4">
                <FormControlLabel
                  control={<Switch size="small" checked={ui.snap} onChange={(e) => editor.patchEditor({ snap: e.target.checked })} />}
                  label={<span className="text-xs font-medium">Ajustar a las guías (imán)</span>}
                />
                <FormControlLabel
                  control={<Switch size="small" checked={ui.showGrid} onChange={(e) => editor.patchEditor({ showGrid: e.target.checked })} />}
                  label={<span className="text-xs font-medium">Rejilla</span>}
                />
                {ui.showGrid ? (
                  <TextField
                    select
                    size="small"
                    label="Cada"
                    value={ui.gridMm}
                    onChange={(e) => editor.patchEditor({ gridMm: Number(e.target.value) as 1 | 2 | 5 })}
                    className="w-24"
                  >
                    {[1, 2, 5].map((g) => (
                      <MenuItem key={g} value={g}>
                        {g} mm
                      </MenuItem>
                    ))}
                  </TextField>
                ) : null}
              </div>
              {customized ? (
                <span className="rounded-full border border-warning bg-warning/10 px-2.5 py-0.5 text-xs font-semibold text-warning">
                  Esta pieza tiene posición propia
                </span>
              ) : (
                <span className="text-xs text-muted">Mesa de trabajo · {spec.width} × {spec.height} mm</span>
              )}
            </div>

            <div className="p-4">
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
            </div>

            <div className="border-t border-divider bg-background/40 px-4 py-2 text-center text-xs text-muted">
              Arrastra con el mouse o usa las flechas del teclado (<strong>0.5 mm</strong> · <strong>Mayús 5 mm</strong> · <strong>Alt 0.1 mm</strong>)
            </div>
          </div>

          <OverlapAlert
            layout={layout}
            onFit={() => {
              const r = editor.fitContentAboveQr();
              if (!r.ok) notify({ message: r.message, severity: "warning", group: "records" });
            }}
          />
          {warnings.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm" aria-label="Avisos de composición" data-testid="layout-warnings">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-1.5 text-warning">
                  <WarningAmberIcon fontSize="small" aria-hidden />
                  {describeLayoutWarning(w)}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <aside aria-label="Ajustes" className="flex flex-col gap-3">
          <Section title="Posición y medidas" defaultExpanded>
            <div className="flex flex-col gap-3.5">
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
              <CoordinatesPanel
                layout={layout}
                box={ui.box}
                unit={ui.unit}
                disabled={disabled}
                onBox={(box) => editor.patchEditor({ box })}
                onUnit={(unit) => editor.patchEditor({ unit })}
                onCommit={(key, box) => editor.setBox(key, box)}
              />
            </div>
          </Section>
          <Section title="Plantilla y tipografía" defaultExpanded>
            <div className="flex flex-col gap-3">
              <TemplatePicker actions={builder} />
              <TemplatePanel template={template} overrides={templateOverrides} disabled={disabled} onChange={(next) => editor.setTemplateOverrides(next)} />
            </div>
          </Section>
        </aside>
      </div>

      <StepFooter back={{ href: "/style", label: "Estilo del QR" }} next={{ href: "/export", label: "Siguiente: Exportar" }} />
    </div>
  );
}
