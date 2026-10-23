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
import type { HexColor, QRRecord } from "@/types";

import { useEditorActions } from "@/components/editor/useEditorActions";
import { useUndoRedo } from "@/components/editor/useUndoRedo";
import { svgDataUrl, useTile } from "@/components/preview/useTile";
import { TilePreview } from "@/components/preview/TilePreview";
import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { EmptyState } from "@/components/ui/EmptyState";
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
  // Si ninguna pieza es estirable o aún no hay piezas, se crea una pieza de muestra (SAMPLE_RECORD) para previsualizar la placa con el enlace de ejemplo.
  const index = Math.max(0, records.findIndex((r) => r.id === currentId));
  const current = records[index];
  const sampleFallbackRecord = useMemo<QRRecord>(() => {
    const now = new Date().toISOString();
    return {
      id: "preview-sample",
      area: "Terraza",
      estacion: "Bar",
      mesa: "Mesa 1",
      subgrupo: "",
      concepto: "",
      menuUrl: SAMPLE_PAYLOAD,
      qrStatus: "pending",
      qr: { source: "none" },
      order: 0,
      metadata: { origin: "manual" },
      validationErrors: [],
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  const shown = (current && isStylable(current) ? current : records.find(isStylable)) ?? sampleFallbackRecord;
  const payload = stylablePayload(shown) || SAMPLE_PAYLOAD;
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
      <EmptyState.Root aria-label="Sin piezas">
        <EmptyState.Header>
          <EmptyState.Title>Aún no hay piezas</EmptyState.Title>
          <EmptyState.Description>Agrega o importa piezas en el primer paso para personalizar el estilo de su código QR.</EmptyState.Description>
        </EmptyState.Header>
        <EmptyState.PrimaryAction>
          <Button component={Link} href="/editor" variant="contained">
            Ir a las piezas
          </Button>
        </EmptyState.PrimaryAction>
      </EmptyState.Root>
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-divider bg-surface px-4 py-2.5 shadow-2xs" role="toolbar" aria-label="Deshacer y rehacer">
        <div className="flex items-center gap-1.5">
          <Tooltip title="Deshacer (Ctrl/⌘ + Z)">
            <span>
              <IconButton
                size="small"
                aria-label="Deshacer"
                onClick={history.undo}
                disabled={disabled || !history.canUndo}
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
                onClick={history.redo}
                disabled={disabled || !history.canRedo}
                className="!h-9 !w-9 max-sm:!h-11 max-sm:!w-11 !rounded-lg !border !border-divider !bg-background/60"
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </div>
        <Button
          size="small"
          variant="outlined"
          disabled={disabled || !customized}
          onClick={() => commit(structuredClone(DEFAULT_QR_STYLE))}
          className="!rounded-full !px-3.5"
        >
          Restablecer al QR clásico
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,29rem)_minmax(0,1fr)]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <Panel title="1. Geometría y esquinas" description="Elige el contorno general, el trazo de los módulos y el estilo de los tres cuadros localizadores.">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Contorno</span>
                <ShapePicker label="Contorno del QR" value={style.outline} options={OUTLINES} disabled={disabled} onChange={(outline) => update({ outline })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Marco de esquinas</span>
                <ShapePicker label="Forma del marco de las esquinas" value={style.eyeFrame} options={EYE_FRAMES} disabled={disabled} onChange={(eyeFrame) => update({ eyeFrame })} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-divider pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Módulos de datos</span>
              <ShapePicker label="Forma de los módulos" value={style.modules} options={MODULES} disabled={disabled} onChange={(modules) => update({ modules })} />
            </div>

            <div className="flex flex-col gap-1.5 border-t border-divider pt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Centro de esquinas</span>
              <ShapePicker label="Forma del centro de las esquinas" value={style.eyeBall} options={EYE_BALLS} disabled={disabled} onChange={(eyeBall) => update({ eyeBall })} />
            </div>
          </Panel>

          <Panel title="2. Tinta y contraste" description="Usa tintas oscuras sobre un fondo claro para garantizar lectura inmediata en cualquier celular.">
            <ColorField label="Módulos" value={colors.modules} custom={style.colors.modules !== null} autoLabel="Igual que la plantilla" disabled={disabled} onChange={(c: HexColor) => updateColors({ modules: c })} onReset={() => updateColors({ modules: null })} />
            <ColorField label="Marco de las esquinas" value={colors.eyeFrame} custom={style.colors.eyeFrame !== null} autoLabel="Igual que los módulos" disabled={disabled} onChange={(c: HexColor) => updateColors({ eyeFrame: c })} onReset={() => updateColors({ eyeFrame: null })} />
            <ColorField label="Centro de las esquinas" value={colors.eyeBall} custom={style.colors.eyeBall !== null} autoLabel="Igual que el marco" disabled={disabled} onChange={(c: HexColor) => updateColors({ eyeBall: c })} onReset={() => updateColors({ eyeBall: null })} />
            <ColorField label="Fondo" value={colors.background} custom={style.colors.background !== null} autoLabel="Igual que la plantilla" disabled={disabled} onChange={(c: HexColor) => updateColors({ background: c })} onReset={() => updateColors({ background: null })} />
          </Panel>

          <Panel title="3. Isotipo central (Logo)" description="Inserta un vector SVG al centro. El código mantiene su lectura gracias a la corrección de errores nivel H.">
            <LogoControls logo={style.logo} disabled={disabled} onChange={(logo) => update({ logo })} />
          </Panel>
        </div>

        <div className="order-1 flex flex-col gap-4 lg:sticky lg:top-4 lg:order-2 lg:self-start">
          <Panel title="Mesa de pruebas en vivo" description="Compara la matriz vectorial aislada y su aplicación real sobre la placa de 70 × 70 mm." className="rounded-t-[28px] rounded-b-xl">
            <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 sm:grid-cols-2">
              <figure className="m-0 flex flex-col gap-2">
                <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-divider bg-background p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- SVG generado aquí mismo; next/image no aporta nada */}
                  <img src={svgDataUrl(qrSvg)} alt="Vista previa del QR con el estilo elegido" data-testid="qr-style-preview" className="h-full w-full select-none" draggable={false} />
                </div>
                <figcaption className="text-center text-xs font-medium text-muted">Matriz QR vectorial</figcaption>
              </figure>
              <figure className="m-0 flex flex-col gap-2">

                <div className="rounded-xl border border-divider bg-background p-2">
                  {shown ? <TilePreview record={shown} /> : <div className="aspect-square rounded bg-background" />}
                </div>

                <figcaption className="text-center text-xs font-medium text-muted">En placa (70 × 70 mm)</figcaption>
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

      <StepFooter
        back={{ href: "/editor", label: "Piezas" }}
        shortcut={{ href: "/export", label: "Ir directo a Exportar" }}
        next={{ href: "/preview", label: "Siguiente: Diseño" }}
      />
    </div>
  );
}

