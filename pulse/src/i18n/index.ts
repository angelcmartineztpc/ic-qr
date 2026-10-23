// ARNÉS: stub de PULSE, no fusionar
/** Stub de react-i18next: devuelve el texto por defecto. */
export function useTranslation() {
  return { t: (key: string, fallback?: string): string => fallback ?? key };
}
