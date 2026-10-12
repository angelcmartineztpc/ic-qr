import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { memoryKv, renderApp } from "../../tests/helpers/render-app";
import type { KeyValueStore } from "@/lib/state/persistence";

import ErrorPage from "./error";

const failingKv: KeyValueStore = { get: async () => Promise.reject(new Error("SecurityError")), set: async () => {}, del: async () => {} };

describe("pantalla de error: el texto dice la verdad sobre el almacenamiento", () => {
  it("con IndexedDB disponible dice que el proyecto sigue guardado", async () => {
    renderApp(<ErrorPage error={new Error("boom")} retry={() => {}} />, { kv: memoryKv() });
    expect(await screen.findByText(/sigue guardado en este navegador/)).toBeTruthy();
  });

  it("con almacenamiento no disponible NO promete que siga guardado", async () => {
    renderApp(<ErrorPage error={new Error("boom")} retry={() => {}} />, { kv: failingKv });
    await waitFor(() => expect(screen.getByText(/no se guarda en este navegador/)).toBeTruthy());
    expect(screen.queryByText(/sigue guardado en este navegador/)).toBeNull();
  });
});
