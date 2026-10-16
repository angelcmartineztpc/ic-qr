import type { HostPolicy } from "../net/safe-fetch";

/**
 * Política de hosts para «Link del QR»: pública, o lista blanca (más nuestro propio origen de archivos,
 * que se lee del storage sin salir a la red).
 */
export function hostPolicyFrom(options: { mode: "public" | "allowlist"; allowedHosts: readonly string[]; ownHost?: string | undefined }): HostPolicy {
  if (options.mode === "public") return { mode: "public" };
  return { mode: "allowlist", hosts: [...options.allowedHosts, ...(options.ownHost ? [options.ownHost] : [])] };
}

/** Hosts que admite el importador de Excel para un Link del QR (`null` = cualquiera). */
export function qrHostMatcher(policy: HostPolicy): ((host: string) => boolean) | undefined {
  if (policy.mode !== "allowlist") return undefined;
  return (host) => policy.hosts.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
}
