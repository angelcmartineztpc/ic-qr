import { Redo2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { useUndoRedo } from "@/components/qr-produccion/editor/useUndoRedo";
import { useEditorActions } from "@/components/qr-produccion/editor/useEditorActions";
import { Panel } from "@/components/qr-produccion/layout/Panel";
import { StepFooter } from "@/components/qr-produccion/layout/StepFooter";
import { TilePreview } from "@/components/qr-produccion/preview/TilePreview";
import { svgDataUrl, useTile } from "@/components/qr-produccion/preview/useTile";
import { PersistenceBanners } from "@/components/qr-produccion/records/PersistenceBanners";
import { useBuilderActions } from "@/components/qr-produccion/records/useBuilderActions";
import { Alert, Button, IconButton, Tooltip } from "@/components/qr-produccion/ui";
import { describeLayoutWarning } from "@/services/qr-produccion/errors/messages.es";
import { styledQrNodes } from "@/services/qr-produccion/qr-style";
import { DEFAULT_QR_STYLE, type QrStyle } from "@/services/qr-produccion/schemas/qr-style";
import { orderedRecords } from "@/services/qr-produccion/state/project";
import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";
import { renderSceneSvg } from "@/services/qr-produccion/svg/render-scene";
import { getTemplate } from "@/services/qr-produccion/templates";
import { resolveTemplate } from "@/services/qr-produccion/template/resolve";
import type { HexColor } from "@/types";

import { ColorField } from "./ColorField";
import { LogoControls } from "./LogoControls";
import { hasOwnQr, isStylable, matrixOf, SAMPLE_PAYLOAD, styleWarningsFor, stylablePayload, templateQrColors } from "./qr-style-model";
import styles from "./QrStyleScreen.module.css";
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
      <section aria-label="Sin piezas" className={styles.empty}>
        <h2 className={styles.emptyTitle}>Aún no hay piezas</h2>
        <p className={styles.emptyText}>Agrega o importa piezas para darle estilo a su QR.</p>
        <Button to="/qr-produccion" variant="contained">Ir a las piezas</Button>
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
    <div className={styles.root}>
      <PersistenceBanners actions={builder} showRestored={false} />
      {disabled ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}
      {error ? <Alert severity="error" role="alert">{error}</Alert> : null}
      <div className={styles.toolbar} role="toolbar" aria-label="Deshacer y rehacer">
        <Tooltip title="Deshacer (Ctrl/⌘ + Z)"><span><IconButton aria-label="Deshacer" onClick={history.undo} disabled={disabled || !history.canUndo}><Undo2 size={20} /></IconButton></span></Tooltip>
        <Tooltip title="Rehacer (Mayús + Ctrl/⌘ + Z)"><span><IconButton aria-label="Rehacer" onClick={history.redo} disabled={disabled || !history.canRedo}><Redo2 size={20} /></IconButton></span></Tooltip>
      </div>

      <div className={styles.layout}>
        <div className={styles.controls}>
          <Panel title="Forma" description="El contorno del código y la forma de cada módulo.">
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Contorno</span>
              <ShapePicker label="Contorno del QR" value={style.outline} options={OUTLINES} disabled={disabled} onChange={(outline) => update({ outline })} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Módulos</span>
              <ShapePicker label="Forma de los módulos" value={style.modules} options={MODULES} disabled={disabled} onChange={(modules) => update({ modules })} />
            </div>
          </Panel>

          <Panel title="Esquinas" description="Los tres cuadros grandes que el lector usa para ubicar el código.">
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Marco</span>
              <ShapePicker label="Forma del marco de las esquinas" value={style.eyeFrame} options={EYE_FRAMES} disabled={disabled} onChange={(eyeFrame) => update({ eyeFrame })} />
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Centro</span>
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

        <div className={styles.side}>
          <Panel title="Vista previa">
            <div className={styles.previews}>
              <figure className={styles.figure}>
                <div className={styles.frame}>
                  <img src={svgDataUrl(qrSvg)} alt="Vista previa del QR con el estilo elegido" data-testid="qr-style-preview" className={styles.qr} draggable={false} />
                </div>
                <figcaption className={styles.caption}>Solo el QR</figcaption>
              </figure>
              <figure className={styles.figure}>
                {shown ? <TilePreview record={shown} /> : <div className={styles.placeholder} />}
                <figcaption className={styles.caption}>En la pieza</figcaption>
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

      <StepFooter back={{ href: "/qr-produccion", label: "Piezas" }} next={{ href: "/qr-produccion/diseno", label: "Siguiente: Diseño" }} />
    </div>
  );
}
