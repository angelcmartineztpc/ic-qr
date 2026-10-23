// @vitest-environment jsdom
import { functionUrl } from "@/services/qr-produccion/app/api-client";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LinkInfo } from "@/services/qr-produccion/schemas/links";

import { renderApp } from "@/services/qr-produccion/test-helpers/render-app";
import { LinkDestination } from "./LinkDestination";

const INFO: LinkInfo = { code: "ab3de9xk", shortUrl: "https://qr.example.com/s/ab3de9xk", destination: "https://menu.example.com/carta", originalUrl: "https://menu.example.com/carta", createdAt: "2026-10-14T12:00:00.000Z", updatedAt: "2026-10-14T12:00:00.000Z", revision: 1, history: [] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("destino del link corto", () => {
  it("muestra el destino vigente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(INFO)));
    renderApp(<LinkDestination code="ab3de9xk" readOnly={false} />);
    expect(await screen.findByRole("link", { name: "https://menu.example.com/carta" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cambiar destino" })).toBeTruthy();
  });

  it("cambiar el destino manda la revisión actual, actualiza lo que se ve y avisa que el QR no cambia", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PATCH" ? json({ ...INFO, destination: "https://nuevo.example.com/menu", revision: 2, history: [{ destination: INFO.destination, at: INFO.updatedAt }] }) : json(INFO)));
    vi.stubGlobal("fetch", fetchMock);
    renderApp(<LinkDestination code="ab3de9xk" readOnly={false} />);
    await user.click(await screen.findByRole("button", { name: "Cambiar destino" }));
    const field = screen.getByLabelText("Destino nuevo");
    expect(screen.getByRole("button", { name: "Guardar destino" }).hasAttribute("disabled")).toBe(true); // sin cambios
    await user.clear(field);
    await user.type(field, "https://nuevo.example.com/menu");
    await user.click(screen.getByRole("button", { name: "Guardar destino" }));

    expect(await screen.findByRole("link", { name: "https://nuevo.example.com/menu" })).toBeTruthy();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe(functionUrl("qr-enlaces", "/links/ab3de9xk")); // Edge Function (antes /api/links/…)
    expect((patch?.[1]?.headers as Record<string, string>)["If-Match"]).toBe('"1"');
    expect(JSON.parse(patch?.[1]?.body as string)).toEqual({ destination: "https://nuevo.example.com/menu" });
    expect(screen.getByText(/Se ha cambiado 1 vez; el QR sigue siendo el mismo/)).toBeTruthy();
  });

  it("si el servidor rechaza el destino, lo explica y deja el diálogo abierto", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "PATCH" ? json({ code: "VALIDATION_FAILED", message: "Debe ser una URL http(s) válida con dominio" }, 400) : json(INFO))));
    renderApp(<LinkDestination code="ab3de9xk" readOnly={false} />);
    await user.click(await screen.findByRole("button", { name: "Cambiar destino" }));
    await user.clear(screen.getByLabelText("Destino nuevo"));
    await user.type(screen.getByLabelText("Destino nuevo"), "no es un link");
    await user.click(screen.getByRole("button", { name: "Guardar destino" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/URL http\(s\) válida/);
    expect(screen.getByLabelText("Destino nuevo")).toBeTruthy();
  });

  it("en solo lectura se ve el destino pero no se puede cambiar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(INFO)));
    renderApp(<LinkDestination code="ab3de9xk" readOnly />);
    await screen.findByRole("link", { name: "https://menu.example.com/carta" });
    expect(screen.queryByRole("button", { name: "Cambiar destino" })).toBeNull();
  });

  it("si no se puede consultar el destino lo dice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ code: "NOT_FOUND", message: "Este link corto no existe" }, 404)));
    renderApp(<LinkDestination code="ab3de9xk" readOnly={false} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Este link corto no existe"));
  });
});
