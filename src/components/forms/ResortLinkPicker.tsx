"use client";

import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { useState } from "react";

import { buildServiceUrl, findPropertyByCode, properties, SERVICE_LABELS, SERVICES, type Service } from "@/lib/resorts/properties";

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
    const domain = process.env.NEXT_PUBLIC_QR_DOMAIN || window.location.origin;
    onPick(buildServiceUrl(property, nextService, domain));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField select label="Resort" value={code} onChange={(e) => pick(e.target.value, service)} disabled={disabled} helperText="El QR se genera con el link estable de este resort y servicio.">
        {properties.map((p) => (
          <MenuItem key={p.resortCode} value={p.resortCode}>
            {p.name} ({p.resortCode})
          </MenuItem>
        ))}
      </TextField>
      <TextField select label="Servicio" value={service} onChange={(e) => pick(code, e.target.value as Service)} disabled={disabled}>
        {SERVICES.map((s) => (
          <MenuItem key={s} value={s}>
            {SERVICE_LABELS[s]}
          </MenuItem>
        ))}
      </TextField>
    </div>
  );
}
