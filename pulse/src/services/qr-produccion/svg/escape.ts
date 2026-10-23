/** Escapa texto y atributos XML. Todo valor del usuario pasa por aquí antes de entrar al SVG. */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c);
}

/** Quita caracteres no válidos en XML 1.0 (controles) además de escapar. */
export function xmlText(value: string): string {
  return escapeXml(value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ""));
}
