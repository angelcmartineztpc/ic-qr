"use client";

import RedoIcon from "@mui/icons-material/Redo";
import UndoIcon from "@mui/icons-material/Undo";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { describeLayoutWarning } from "@/lib/errors/messages.es";
import { styledQrNodes } from "@/lib/qr-style";
import { renderSceneSvg } from "@/lib/svg/render-scene";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";
import { resolveTemplate } from "@/lib/template/resolve";
import { DEFAULT_QR_STYLE, type QrStyle } from "@/schemas/qr-style";
import { getTemplate } from "@/templates";
import type { HexColor } from "@/types";

import { useEditorActions } from "@/components/editor/useEditorActions";
import { useUndoRedo } from "@/components/editor/useUndoRedo";
import { svgDataUrl, useTile } from "@/components/preview/useTile";
import { TilePreview } from "@/components/preview/TilePreview";
import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { Panel } from "@/components/ui/Panel";
import { StepFooter } from "@/components/ui/StepFooter";

import { ColorField } from "./ColorField";
import { LogoControls } from "./LogoControls";
import { hasOwnQr, isStylable, matrixOf, SAMPLE_PAYLOAD, styleWarningsFor, stylablePayload, templateQrColors } from "./qr-style-model";
import { ShapePicker, type ShapeOption } from "./ShapePicker";
import { EyeBallSwatch, EyeFrameSwatch, ModuleSwatch, OutlineSwatch } from "./swatches";

const OUTLINES: ShapeOption<QrStyle["outline"]>[] = [
  { value: "square", label: "Cuadrado", icon: <OutlineSwatch shape="square" /> },
  { value: "circle", label: "Círculo", icon: <OutlineSwatch shape="circle" /> },
];
const MODULES: ShapeOption<QrStyle["modules"]>[] = [
  { value: "square", label: "Cuadrado", icon: <ModuleSwatch shape="square" /> },
  { value: "rounded", label: "Redondeado", icon: <ModuleSwatch shape="rounded" /> },
  { value: "extra-rounded", label: "Muy redondeado", icon: <ModuleSwatch shape="extra-rounded" /> },
  { value: "dots", label: "Puntos", icon: <ModuleSwatch shape="dots" /> },
  { value: "classy", label: "Hoja", icon: <ModuleSwatch shape="classy" /> },
  { value: "classy-rounded", label: "Hoja suave", icon: <ModuleSwatch shape="classy-rounded" /> },
];
const EYE_NAMES = { square: "Cuadrado", rounded: "Redondeado", circle: "Círculo" } as const;
const EYE_FRAMES: ShapeOption<QrStyle["eyeFrame"]>[] = (["square", "rounded", "circle"] as const).map((value) => ({ value, label: EYE_NAMES[value], icon: <EyeFrameSwatch shape={value} /> }));
const EYE_BALLS: ShapeOption<QrStyle["eyeBall"]>[] = (["square", "rounded", "circle"] as const).map((value) => ({ value, label: EYE_NAMES[value], icon: <EyeBallSwatch shape={value} /> }));

const PREVIEW_MM = 50;

/** Paso 2: estilo del QR (forma, esquinas, colores y logo). Solo cambia cómo se dibuja la matriz; el contenido y el archivo del QR no cambian. */
export function QrStyleScreen() {
  const builder = useBuilderActions();
  const editor = useEditorActions();
  const history = useUndoRedo();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const currentId = useSession((s) => s.selection.currentId);
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const templateId = useProject((p) => p.templateId);
  const overrides = useProject((p) => p.templateOverrides);
  const style = overrides.qrStyle;
  const base = getTemplate(templateId);
  const [error, setError] = useState<string | null>(null);

  const resolved = useMemo(() => (base ? resolveTemplate(base, overrides) : null), [base, overrides]);
  const template = resolved?.success ? resolved.data : base;

  // Pieza que se muestra: la actual si su QR se puede estilizar; si no, la primera que sí.
  const index = Math.max(0, records.findIndex((r) => r.id === currentId));
  const current = records[index];
  const shown = current && isStylable(current) ? current : records.find(isStylable);
  const payload = (shown && stylablePayload(shown)) || SAMPLE_PAYLOAD;
  const matrix = useMemo(() => matrixOf(payload) ?? (matrixOf(SAMPLE_PAYLOAD) as NonNullable<ReturnType<typeof matrixOf>>), [payload]);
  const { result: tile } = useTile(shown);
  const existingCount = records.filter(hasOwnQr).length;

  const qrSvg = useMemo(() => {
    if (!template) return "";
    const { nodes } = styledQrNodes({
      box: { x: 0, y: 0, width: PREVIEW_MM },
      matrix,
      quietZoneModules: template.qr.quietZoneModules,
      style,
      base: templateQrColors(template.qr),
      includeBackground: true,
    });
    return renderSceneSvg({ widthMm: PREVIEW_MM, heightMm: PREVIEW_MM, nodes, warnings: [], meta: { recordId: "estilo", templateId: template.id, templateVersion: template.version } }, { title: "Vista previa del QR con el estilo elegido" });
  }, [template, matrix, style]);

  if (!hydrated) return <p role="status">Cargando…</p>;
  if (!template) return <Alert severity="error">La plantilla «{templateId}» ya no existe. Elige otra en el paso Diseño.</Alert>;
  if (records.length === 0) {
    return (
      <section aria-label="Sin piezas" className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-divider p-10 text-center">
        <h2 className="m-0 text-lg font-semibold">Aún no hay piezas</h2>
        <p className="m-0 max-w-md text-muted">Agrega o importa piezas para darle estilo a su QR.</p>
        <Button component={Link} href="/editor" variant="contained">Ir a las piezas</Button>
      </section>
    );
  }

  const disabled = readOnly;
  const styled = styleWarningsFor(style, template.qr, matrix.length);
  const { colors } = styled;
  // Además de la legibilidad del estilo, el tamaño de módulo de la pieza real (el contorno circular lo reduce).
  const warnings = [...styled.warnings, ...(tile?.warnings ?? []).filter((w) => w.code === "QR_MODULE_SMALL")] as typeof styled.warnings;
  const customized = JSON.stringify(style) !== JSON.stringify(DEFAULT_QR_STYLE);

  const commit = (next: QrStyle) => {
    const result = editor.setTemplateOverrides({ ...overrides, qrStyle: next });
    setError(result.ok ? null : result.message);
  };
  const update = (patch: Partial<QrStyle>) => commit({ ...style, ...patch });
  const updateColors = (patch: Partial<QrStyle["colors"]>) => update({ colors: { ...style.colors, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      <PersistenceBanners actions={builder} showRestored={false} />
      {disabled ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}
      {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
      <div className="flex justify-end gap-1" role="toolbar" aria-label="Deshacer y rehacer">
        <Tooltip title="Deshacer (Ctrl/⌘ + Z)"><span><IconButton aria-label="Deshacer" onClick={history.undo} disabled={disabled || !history.canUndo}><UndoIcon /></IconButton></span></Tooltip>
        <Tooltip title="Rehacer (Mayús + Ctrl/⌘ + Z)"><span><IconButton aria-label="Rehacer" onClick={history.redo} disabled={disabled || !history.canRedo}><RedoIcon /></IconButton></span></Tooltip>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <Panel title="Forma" description="El contorno del código y la forma de cada módulo.">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Contorno</span>
              <ShapePicker label="Contorno del QR" value={style.outline} options={OUTLINES} disabled={disabled} onChange={(outline) => update({ outline })} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Módulos</span>
              <ShapePicker label="Forma de los módulos" value={style.modules} options={MODULES} disabled={disabled} onChange={(modules) => update({ modules })} />
            </div>
          </Panel>

          <Panel title="Esquinas" description="Los tres cuadros grandes que el lector usa para ubicar el código.">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Marco</span>
              <ShapePicker label="Forma del marco de las esquinas" value={style.eyeFrame} options={EYE_FRAMES} disabled={disabled} onChange={(eyeFrame) => update({ eyeFrame })} />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Centro</span>
              <ShapePicker label="Forma del centro de las esquinas" value={style.eyeBall} options={EYE_BALLS} disabled={disabled} onChange={(eyeBall) => update({ eyeBall })} />
            </div>
          </Panel>

          <Panel title="Colores" description="Usa colores oscuros sobre un fondo claro: así lo leen todos los celulares.">
            <ColorField label="Módulos" value={colors.modules} custom={style.colors.modules !== null} autoLabel="Igual que la plantilla" disabled={disabled} onChange={(c: HexColor) => updateColors({ modules: c })} onReset={() => updateColors({ modules: null })} />
            <ColorField label="Marco de las esquinas" value={colors.eyeFrame} custom={style.colors.eyeFrame !== null} autoLabel="Igual que los módulos" disabled={disabled} onChange={(c: HexColor) => updateColors({ eyeFrame: c })} onReset={() => updateColors({ eyeFrame: null })} />
            <ColorField label="Centro de las esquinas" value={colors.eyeBall} custom={style.colors.eyeBall !== null} autoLabel="Igual que el marco" disabled={disabled} onChange={(c: HexColor) => updateColors({ eyeBall: c })} onReset={() => updateColors({ eyeBall: null })} />
            <ColorField label="Fondo" value={colors.background} custom={style.colors.background !== null} autoLabel="Igual que la plantilla" disabled={disabled} onChange={(c: HexColor) => updateColors({ background: c })} onReset={() => updateColors({ background: null })} />
          </Panel>

          <Panel title="Logo" description="Un SVG al centro del QR. El código sigue leyéndose gracias a la corrección de errores, mientras el logo no sea demasiado grande.">
            <LogoControls logo={style.logo} disabled={disabled} onChange={(logo) => update({ logo })} />
          </Panel>

          <div>
            <Button variant="outlined" disabled={disabled || !customized} onClick={() => commit(structuredClone(DEFAULT_QR_STYLE))}>
              Restablecer al QR clásico
            </Button>
          </div>
        </div>

        <div className="order-1 flex flex-col gap-4 lg:sticky lg:top-4 lg:order-2 lg:self-start">
          <Panel title="Vista previa">
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:grid-cols-2">
              <figure className="m-0 flex flex-col gap-2">
                <div className="flex aspect-square w-full items-center justify-center rounded bg-background p-4 ring-1 ring-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí mismo; next/image no aporta nada */}
                  <img src={svgDataUrl(qrSvg)} alt="Vista previa del QR con el estilo elegido" data-testid="qr-style-preview" className="h-full w-full select-none" draggable={false} />
                </div>
                <figcaption className="text-center text-sm text-muted">Solo el QR</figcaption>
              </figure>
              <figure className="m-0 flex flex-col gap-2">
                {shown ? <TilePreview record={shown} /> : <div className="aspect-square rounded bg-background" />}
                <figcaption className="text-center text-sm text-muted">En la pieza</figcaption>
              </figure>
            </div>
            {shown && shown.id !== current?.id ? (
              <Alert severity="info">La pieza que miras usa un QR existente (Link del QR) y no se estiliza; te mostramos otra para que veas el resultado.</Alert>
            ) : null}
            {!shown ? <Alert severity="info">Ninguna pieza tiene un QR que se pueda estilizar todavía; la vista previa usa un enlace de ejemplo.</Alert> : null}
          </Panel>

          {existingCount > 0 ? (
            <Alert severity="info" data-testid="existing-note">
              {existingCount === 1 ? "1 pieza trae su propio QR (Link del QR)" : `${existingCount} piezas traen su propio QR (Link del QR)`}: se usa ese recurso tal cual y el estilo no le aplica.
            </Alert>
          ) : null}
          {warnings.map((warning, i) => (
            <Alert key={i} severity={"level" in warning && warning.level === "block" ? "error" : "warning"} data-testid="qr-style-warning">
              {describeLayoutWarning(warning)}
            </Alert>
          ))}
        </div>
      </div>

      <StepFooter back={{ href: "/editor", label: "Piezas" }} next={{ href: "/preview", label: "Siguiente: Diseño" }} />
    </div>
  );
}
