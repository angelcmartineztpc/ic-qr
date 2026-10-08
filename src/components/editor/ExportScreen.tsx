"use client";

import DownloadIcon from "@mui/icons-material/Download";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Link from "next/link";
import { useShallow } from "zustand/react/shallow";

import { resolveQrDecision } from "@/lib/records/qr-state";
import { orderedRecords } from "@/lib/state/project";
import { useProject, useSession } from "@/lib/state/StoreProvider";
import { isGenerating } from "@/lib/state/stores";
import { getTemplate } from "@/templates";

import { PersistenceBanners } from "@/components/records/PersistenceBanners";
import { useBuilderActions } from "@/components/records/useBuilderActions";
import { Panel } from "@/components/ui/Panel";
import { StepFooter } from "@/components/ui/StepFooter";

import { DownloadProgress } from "./DownloadProgress";
import { ExportBlockersDialog } from "./ExportBlockersDialog";
import { FileNameInput } from "./FileNameInput";
import { GenerationStatus } from "./GenerationStatus";
import { PDFPreview } from "./PDFPreview";
import { PdfOptionsPanel } from "./PdfOptionsPanel";
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
  const template = getTemplate(templateId);

  if (!hydrated) return <p role="status">Cargando…</p>;
  if (!template) return <Alert severity="error">La plantilla «{templateId}» ya no existe. Elígela de nuevo en el paso Diseño.</Alert>;
  if (records.length === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <h2 className="m-0 text-lg font-semibold">Aún no hay piezas que exportar</h2>
          <p className="m-0 max-w-md text-muted">Crea o importa piezas en el primer paso.</p>
          <Button component={Link} href="/editor" variant="contained">Ir a las piezas</Button>
        </div>
      </Panel>
    );
  }

  const included = records.filter((r) => !excluded.includes(r.id));
  const blocked = included.filter((r) => r.qrError !== undefined || r.validationErrors.some((i) => i.severity === "error")).length;
  const needQr = included.filter((r) => r.qrError === undefined && ["generate", "check-existing"].includes(resolveQrDecision(r))).length;
  const generating = isGenerating(generation);
  const disabled = readOnly;

  return (
    <div className="flex flex-col gap-6">
      <PersistenceBanners actions={builder} showRestored={false} />
      {readOnly ? <Alert severity="info">Esta pestaña está en solo lectura: la otra pestaña es la que edita.</Alert> : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Qué se exporta" description={`Plantilla «${template.name}», ${template.tile.width} × ${template.tile.height} mm`}>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm" data-testid="export-summary">
              <dt className="text-muted">Piezas</dt>
              <dd className="m-0 font-medium">{plural(included.length, "pieza", "piezas")}</dd>
              <dt className="text-muted">QR por generar</dt>
              <dd className="m-0 font-medium">{needQr === 0 ? "Todos listos" : `${needQr} (se generan al descargar)`}</dd>
              {blocked > 0 ? (
                <>
                  <dt className="text-muted">Con errores</dt>
                  <dd className="m-0 font-medium text-warning">{blocked} · <Link href="/editor">revisar</Link></dd>
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
            <PdfOptionsPanel options={exportOptions.pdf} tile={template.tile} count={included.length} disabled={disabled} onChange={(patch) => editor.setPdfOptions(patch)} formats={exportOptions.formats} zipNaming={exportOptions.zipNaming} onFormats={(formats, naming) => editor.setFormats(formats, naming)} />
          </Panel>
        </div>

        <Panel title="Hojas del PDF" description="Así se colocan las piezas; el número es su orden." className="self-start lg:sticky lg:top-40">
          <PDFPreview tile={template.tile} options={exportOptions.pdf} count={included.length} />
          {generation.phase === "done" && generation.result ? (
            <Alert severity={generation.result.warnings > 0 ? "warning" : "success"} data-testid="last-export" action={generation.result.zip ? <Button color="inherit" size="small" onClick={() => exporter.downloadZip()}>Descargar ZIP</Button> : undefined}>
              Última exportación: {plural(generation.result.pieces, "pieza", "piezas")} en {plural(generation.result.pages, "página", "páginas")}
              {generation.result.warnings > 0 ? `, con ${plural(generation.result.warnings, "aviso", "avisos")} de composición` : ""}.
            </Alert>
          ) : null}
        </Panel>
      </div>

      <StepFooter
        back={{ href: "/preview", label: "Diseño" }}
        primary={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <GenerationStatus />
            <Button variant="contained" size="large" startIcon={<DownloadIcon />} disabled={disabled || generating || included.length === 0} onClick={() => void exporter.start()} data-testid="download-pdf">
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
