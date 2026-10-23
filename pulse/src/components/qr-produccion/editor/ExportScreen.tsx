import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import { Alert, Button } from "@/components/qr-produccion/ui";
import { blockingStyleWarnings } from "@/components/qr-produccion/qr-style/qr-style-model";
import { describeLayoutWarning } from "@/services/qr-produccion/errors/messages.es";
import { resolveQrDecision } from "@/services/qr-produccion/records/qr-state";
import { resolveTemplate } from "@/services/qr-produccion/template/resolve";
import { orderedRecords } from "@/services/qr-produccion/state/project";
import { useProject, useSession } from "@/services/qr-produccion/state/StoreProvider";
import { isGenerating } from "@/services/qr-produccion/state/stores";
import { getTemplate } from "@/services/qr-produccion/templates";

import { PersistenceBanners } from "@/components/qr-produccion/records/PersistenceBanners";
import { useBuilderActions } from "@/components/qr-produccion/records/useBuilderActions";
import { Panel } from "@/components/qr-produccion/layout/Panel";
import { StepFooter } from "@/components/qr-produccion/layout/StepFooter";

import { DownloadProgress } from "./DownloadProgress";
import { ExportBlockersDialog } from "./ExportBlockersDialog";
import { FileNameInput } from "./FileNameInput";
import { GenerationStatus } from "./GenerationStatus";
import { PdfViewer } from "./PdfViewer";
import { PdfOptionsPanel } from "./PdfOptionsPanel";
import styles from "./ExportScreen.module.css";
import { useEditorActions } from "./useEditorActions";
import { useExportActions } from "./useExportActions";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Paso 3: resumen de lo que se exporta, nombre y opciones de la hoja, vista de las hojas y descarga. */
export function ExportScreen() {
  const builder = useBuilderActions();
  const editor = useEditorActions();
  const exporter = useExportActions();
  const hydrated = useSession((s) => s.hydrated);
  const readOnly = useSession((s) => s.writer === "read-only");
  const generation = useSession((s) => s.generation);
  const excluded = useSession(useShallow((s) => s.excluded));
  const records = useProject(useShallow((p) => orderedRecords(p)));
  const templateId = useProject((p) => p.templateId);
  const exportOptions = useProject((p) => p.exportOptions);
  const templateOverrides = useProject((p) => p.templateOverrides);
  const template = getTemplate(templateId);

  if (!hydrated) return <p role="status">Cargando…</p>;
  if (!template) return <Alert severity="error">La plantilla «{templateId}» ya no existe. Elígela de nuevo en el paso Diseño.</Alert>;
  if (records.length === 0) {
    return (
      <Panel>
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>Aún no hay piezas que exportar</h2>
          <p className={styles.emptyText}>Crea o importa piezas en el primer paso.</p>
          <Button to="/qr-produccion" variant="contained">Ir a las piezas</Button>
        </div>
      </Panel>
    );
  }

  const included = records.filter((r) => !excluded.includes(r.id));
  const blocked = included.filter((r) => r.qrError !== undefined || r.validationErrors.some((i) => i.severity === "error")).length;
  const needQr = included.filter((r) => r.qrError === undefined && ["generate", "check-existing"].includes(resolveQrDecision(r))).length;
  const generating = isGenerating(generation);
  const disabled = readOnly;
  // Un estilo que deja el QR ilegible (contraste casi nulo, logo demasiado grande) no se fabrica.
  const resolvedTemplate = resolveTemplate(template, templateOverrides);
  const styleBlockers = blockingStyleWarnings(templateOverrides.qrStyle, resolvedTemplate.success ? resolvedTemplate.data.qr : template.qr, included);

  return (
    <div className={styles.root}>
      <PersistenceBanners actions={builder} showRestored={false} />
      {readOnly ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}
      {styleBlockers.length > 0 ? (
        <Alert severity="error" role="alert" data-testid="style-blocker" action={<Button color="inherit" size="small" to="/qr-produccion/estilo">Corregir estilo</Button>}>
          <ul className={styles.plainList}>
            {styleBlockers.map((warning, i) => <li key={i}>{describeLayoutWarning(warning)}</li>)}
          </ul>
        </Alert>
      ) : null}

      <div className={styles.layout}>
        <div className={styles.column}>
          <Panel title="Qué se exporta" description={`Plantilla «${template.name}», ${template.tile.width} × ${template.tile.height} mm`}>
            <dl className={styles.summary} data-testid="export-summary">
              <dt className={styles.term}>Piezas</dt>
              <dd className={styles.value}>{plural(included.length, "pieza", "piezas")}</dd>
              <dt className={styles.term}>QR por generar</dt>
              <dd className={styles.value}>{needQr === 0 ? "Todos listos" : `${needQr} (se generan al descargar)`}</dd>
              {blocked > 0 ? (
                <>
                  <dt className={styles.term}>Con errores</dt>
                  <dd className={styles.valueWarning}>{blocked} · <Link to="/qr-produccion">revisar</Link></dd>
                </>
              ) : null}
            </dl>
            {excluded.length > 0 ? (
              <Alert severity="info" data-testid="excluded-note" action={<Button color="inherit" size="small" onClick={() => exporter.includeAll()} disabled={generating}>Volver a incluirlas</Button>}>
                {plural(excluded.length, "pieza excluida", "piezas excluidas")} de esta exportación.
              </Alert>
            ) : null}
          </Panel>

          <Panel title="Archivo">
            <FileNameInput value={exportOptions.fileName} disabled={disabled} onChange={(name) => editor.setFileName(name)} />
          </Panel>

          <Panel title="Hoja y formato">
            <PdfOptionsPanel options={exportOptions.pdf} tile={template.tile} count={included.length} disabled={disabled} onChange={(patch) => editor.setPdfOptions(patch)} formats={exportOptions.formats} zipNaming={exportOptions.zipNaming} onFormats={(formats, naming) => editor.setFormats(formats, naming)} pdfBySection={exportOptions.pdfBySection} onPdfBySection={(v) => editor.setPdfBySection(v)} />
          </Panel>
        </div>

        <Panel title="Vista previa del PDF" description="Así quedan las hojas: las piezas reales, en el lugar donde irán en el archivo." className={styles.preview} label="Hojas del PDF">
          <PdfViewer tile={template.tile} options={exportOptions.pdf} records={included} />
          {generation.phase === "done" && generation.result ? (
            <Alert severity={generation.result.warnings > 0 ? "warning" : "success"} data-testid="last-export" action={generation.result.zip ? <Button color="inherit" size="small" onClick={() => exporter.downloadZip()}>Descargar ZIP</Button> : undefined}>
              Última exportación: {plural(generation.result.pieces, "pieza", "piezas")} en {plural(generation.result.pages, "página", "páginas")}
              {generation.result.warnings > 0 ? `, con ${plural(generation.result.warnings, "aviso", "avisos")} de composición` : ""}.
            </Alert>
          ) : null}
        </Panel>
      </div>

      <StepFooter
        back={{ href: "/qr-produccion/diseno", label: "Diseño" }}
        primary={
          <div className={styles.actions}>
            <GenerationStatus />
            <Button variant="contained" size="large" startIcon={<Download size={18} />} disabled={disabled || generating || included.length === 0 || styleBlockers.length > 0} onClick={() => void exporter.start()} data-testid="download-pdf">
              {exportOptions.formats.includes("pdf") ? "Descargar PDF" : "Descargar ZIP de SVG"}
            </Button>
          </div>
        }
      />
      <DownloadProgress actions={exporter} />
      <ExportBlockersDialog actions={exporter} />
    </div>
  );
}
