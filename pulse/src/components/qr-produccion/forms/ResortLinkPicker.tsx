import { useState } from "react";

import { MenuItem, TextField } from "@/components/qr-produccion/ui";
import { buildServiceUrl, findPropertyByCode, properties, SERVICE_LABELS, SERVICES, type Service } from "@/services/qr-produccion/resorts/properties";

import styles from "./ResortLinkPicker.module.css";

interface Props {
  disabled?: boolean;
  onPick(url: string): void;
}

/** Rellena el link del menú con la URL estable del QR (resort + servicio); el destino real se cambia sin reimprimir. */
export function ResortLinkPicker({ disabled, onPick }: Props) {
  const [code, setCode] = useState("");
  const [service, setService] = useState<Service | "">("");

  function pick(nextCode: string, nextService: Service | "") {
    setCode(nextCode);
    setService(nextService);
    const property = findPropertyByCode(nextCode);
    if (!property || !nextService) return;
    const domain = (import.meta.env.VITE_QR_DOMAIN as string | undefined) || window.location.origin;
    onPick(buildServiceUrl(property, nextService, domain));
  }

  return (
    <div className={styles.grid}>
      <TextField select label="Resort" value={code} onChange={(e) => pick(e.target.value, service)} disabled={disabled} helperText="El QR se genera con el link estable de este resort y servicio.">
        <MenuItem value="">{""}</MenuItem>
        {properties.map((p) => (
          <MenuItem key={p.resortCode} value={p.resortCode}>
            {p.name} ({p.resortCode})
          </MenuItem>
        ))}
      </TextField>
      <TextField select label="Servicio" value={service} onChange={(e) => pick(code, e.target.value as Service)} disabled={disabled}>
        <MenuItem value="">{""}</MenuItem>
        {SERVICES.map((s) => (
          <MenuItem key={s} value={s}>
            {SERVICE_LABELS[s]}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
}
