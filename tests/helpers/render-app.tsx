import { ThemeProvider } from "@mui/material/styles";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { theme } from "@/app/_providers/theme";
import type { ResolveFetcher } from "@/lib/app/api-client";
import { StoreProvider, type StoreProviderProps } from "@/lib/state/StoreProvider";
import type { KeyValueStore } from "@/lib/state/persistence";
import type { LockManagerLike } from "@/lib/state/tab-lock";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { NotificationsProvider } from "@/components/ui/NotificationsProvider";
import type { QrResolution } from "@/types";

import { existingSource, generatedSource } from "./records";

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

/** Locks falsos para simular otra pestaña que ya escribe. */
export const heldLocks: LockManagerLike = { request: async (_name, options, callback) => (options.ifAvailable ? callback(null) : undefined) };

export function renderApp(ui: ReactElement, props: Partial<StoreProviderProps> = {}) {
  const view = render(
    <ThemeProvider theme={theme}>
      <NotificationsProvider>
        <ConfirmProvider>
          <StoreProvider kv={memoryKv()} locks={null} fetchResolve={fakeResolve} fetchTiles={async (r) => ({ tiles: Object.fromEntries(r.tiles.map((t) => [t.key, { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>${t.mesa}</title></svg>`, warnings: [] }])) })} {...props}>
            {ui}
          </StoreProvider>
        </ConfirmProvider>
      </NotificationsProvider>
    </ThemeProvider>,
  );
  return view;
}
