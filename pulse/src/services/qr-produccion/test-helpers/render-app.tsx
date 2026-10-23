import { cleanup, render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { afterEach } from "vitest";

import { ConfirmProvider } from "@/components/qr-produccion/layout/ConfirmDialog";
import { NotificationsProvider } from "@/components/qr-produccion/layout/NotificationsProvider";
import type { ResolveFetcher } from "@/services/qr-produccion/app/api-client";
import type { ShortenFetcher } from "@/services/qr-produccion/links/shorten-many";
import type { KeyValueStore } from "@/services/qr-produccion/state/persistence";
import { StoreProvider, type StoreProviderProps } from "@/services/qr-produccion/state/StoreProvider";
import type { LockManagerLike } from "@/services/qr-produccion/state/tab-lock";
import type { QrResolution } from "@/types";

import { existingSource, generatedSource } from "./records";

// jsdom no trae ResizeObserver (el visor del PDF y el virtualizador lo usan).
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Tampoco trae createObjectURL ni pointer capture (sonner lo usa al pulsar un toast).
if (typeof URL !== "undefined" && !("createObjectURL" in URL)) Object.assign(URL, { createObjectURL: () => "", revokeObjectURL: () => undefined });
if (typeof Element !== "undefined" && !("setPointerCapture" in Element.prototype)) Object.assign(Element.prototype, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined });

afterEach(() => {
  cleanup();
});

export function memoryKv(initial: Record<string, unknown> = {}): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map(Object.entries(initial));
  return { data, get: async (k) => data.get(k), set: async (k, v) => void data.set(k, structuredClone(v)), del: async (k) => void data.delete(k) };
}

/** Servidor de QR falso: genera para los que no traen Link del QR y verifica los que sí. */
export const fakeResolve: ResolveFetcher = async (body) => {
  const results: QrResolution[] = [
    ...(body.items ?? []).map((i): QrResolution => ({ recordId: i.recordId, outcome: "generated", qrUrl: `https://cdn.example.com/qr/v1/${"a".repeat(64)}.svg`, qr: generatedSource(i.menuUrl) })),
    ...(body.verify ?? []).map((v): QrResolution => ({ recordId: v.recordId, outcome: "existing-ok", qr: existingSource({ decodedPayload: v.menuUrl }) })),
  ];
  return { results, created: body.items?.length ?? 0, reused: 0, failed: 0 };
};

/** Acortador falso que no cambia nada (las pruebas que no hablan de links siguen viendo el link que escribieron). */
export const identityShorten: ShortenFetcher = async (urls) => urls.map((url) => ({ url, status: "kept", shortUrl: url }));

/** Locks falsos para simular otra pestaña que ya escribe. */
export const heldLocks: LockManagerLike = { request: async (_name, options, callback) => (options.ifAvailable ? callback(null) : undefined) };

export function renderApp(ui: ReactElement, props: Partial<StoreProviderProps> = {}) {
  return render(
    <MemoryRouter>
      <NotificationsProvider>
        <Toaster />
        <ConfirmProvider>
          <StoreProvider kv={memoryKv()} locks={null} fetchResolve={fakeResolve} fetchShorten={identityShorten} fetchTiles={async (r) => ({ tiles: Object.fromEntries(r.tiles.map((t) => [t.key, { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>${t.mesa}</title></svg>`, warnings: [] }])) })} {...props}>
            {ui}
          </StoreProvider>
        </ConfirmProvider>
      </NotificationsProvider>
    </MemoryRouter>,
  );
}
