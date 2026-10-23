import type { QrMatrix } from "@/types";
import { encodeMatrix } from "@/lib/qr/encode";

export type QrPayloadType = "url" | "wifi" | "vcard" | "whatsapp" | "email" | "text";

export interface WifiPayloadData {
  ssid: string;
  password: string;
  encryption: "WPA" | "WEP" | "nopass";
  hidden: boolean;
}

export interface VCardPayloadData {
  firstName: string;
  lastName: string;
  organization: string;
  title: string;
  phone: string;
  email: string;
  website: string;
}

export interface WhatsappPayloadData {
  phone: string;
  message: string;
}

export interface EmailPayloadData {
  to: string;
  subject: string;
  body: string;
}

export interface UniversalQrData {
  type: QrPayloadType;
  url: string;
  wifi: WifiPayloadData;
  vcard: VCardPayloadData;
  whatsapp: WhatsappPayloadData;
  email: EmailPayloadData;
  text: string;
}

export const DEFAULT_UNIVERSAL_DATA: UniversalQrData = {
  type: "url",
  url: "https://ejemplo.com/menu",
  wifi: {
    ssid: "Red_Invitados",
    password: "",
    encryption: "WPA",
    hidden: false,
  },
  vcard: {
    firstName: "Nombre",
    lastName: "Apellido",
    organization: "Empresa S.A.",
    title: "Dirección",
    phone: "+52 55 1234 5678",
    email: "contacto@ejemplo.com",
    website: "https://ejemplo.com",
  },
  whatsapp: {
    phone: "5215512345678",
    message: "Hola, me gustaría solicitar más información.",
  },
  email: {
    to: "hola@ejemplo.com",
    subject: "Consulta desde código QR",
    body: "Hola, escaneé su código QR y quisiera consultar...",
  },
  text: "Escribe aquí cualquier texto o nota libre para codificar en el QR.",
};

const escapeWifi = (val: string): string => val.replace(/([\\;,:])/g, "\\$1");

export function buildPayloadString(data: UniversalQrData): string {
  switch (data.type) {
    case "url":
      return data.url.trim() || "https://ejemplo.com";

    case "wifi": {
      const { ssid, password, encryption, hidden } = data.wifi;
      const cleanSsid = escapeWifi(ssid.trim() || "WiFi");
      const cleanPass = encryption === "nopass" ? "" : escapeWifi(password);
      return `WIFI:T:${encryption};S:${cleanSsid};P:${cleanPass};H:${hidden ? "true" : "false"};;`;
    }

    case "vcard": {
      const { firstName, lastName, organization, title, phone, email, website } = data.vcard;
      const fn = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "Contacto";
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${lastName.trim()};${firstName.trim()};;;`,
        `FN:${fn}`,
        ...(organization.trim() ? [`ORG:${organization.trim()}`] : []),
        ...(title.trim() ? [`TITLE:${title.trim()}`] : []),
        ...(phone.trim() ? [`TEL;TYPE=CELL:${phone.trim()}`] : []),
        ...(email.trim() ? [`EMAIL:${email.trim()}`] : []),
        ...(website.trim() ? [`URL:${website.trim()}`] : []),
        "END:VCARD",
      ];
      return lines.join("\n");
    }

    case "whatsapp": {
      const cleanPhone = data.whatsapp.phone.replace(/[^\d]/g, "");
      const msg = data.whatsapp.message.trim();
      const query = msg ? `?text=${encodeURIComponent(msg)}` : "";
      return `https://wa.me/${cleanPhone || "5215500000000"}${query}`;
    }

    case "email": {
      const to = data.email.to.trim() || "contacto@ejemplo.com";
      const params = new URLSearchParams();
      if (data.email.subject.trim()) params.set("subject", data.email.subject.trim());
      if (data.email.body.trim()) params.set("body", data.email.body.trim());
      const qs = params.toString();
      return `mailto:${to}${qs ? `?${qs}` : ""}`;
    }

    case "text":
      return data.text.trim() || "QR";
  }
}

export function safeMatrixOf(payload: string): QrMatrix {
  try {
    return encodeMatrix(payload || "https://ejemplo.com");
  } catch {
    return encodeMatrix("https://ejemplo.com");
  }
}

