import { ImportScreen } from "@/components/qr-produccion/import/ImportScreen";
import { AppShell, NavButton } from "@/components/qr-produccion/layout/AppShell";
import { StepHeader } from "@/components/qr-produccion/layout/StepHeader";

export default function Importar() {
  return (
    <AppShell step={0}>
      <StepHeader
        step={0}
        title="Importa desde Excel o CSV"
        description="Sube el archivo, revisa errores y duplicados y confirma. Si una fila trae Link del QR se usa ese QR; si no, se genera uno nuevo."
        actions={
          <NavButton href="/qr-produccion" variant="text">
            ← Volver a las piezas
          </NavButton>
        }
      />
      <ImportScreen />
    </AppShell>
  );
}
