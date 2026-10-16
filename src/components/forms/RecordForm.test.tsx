import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ShortenFetcher } from "@/lib/links/shorten-many";
import type { RecordDraft } from "@/types";

import { renderApp } from "../../../tests/helpers/render-app";
import { RecordForm } from "./RecordForm";

const LONG = `https://menu.palaceresorts.com/restaurant/carta?id=1&utm_source=qr&token=${"x".repeat(120)}`;
const SHORT = "https://qr.example.com/s/ab3de9xk";
const shortener: ShortenFetcher = async (urls) => urls.map((url) => (url.startsWith("https://qr.example.com/s/") ? { url, status: "kept" as const, shortUrl: url } : { url, status: "created" as const, shortUrl: SHORT, code: "ab3de9xk" }));
const field = () => screen.getByLabelText(/^Link del menú/) as HTMLInputElement;
/** Escribe de golpe: teclear 190 caracteres uno a uno con la vista previa viva tarda segundos y contamina las pruebas siguientes. */
const setValue = (text: string) => fireEvent.change(field(), { target: { value: text } });

function open(fetchShorten: ShortenFetcher = shortener, onSubmit: (d: RecordDraft) => Promise<boolean> = async () => true) {
  return renderApp(<RecordForm open record={null} onClose={() => undefined} onSubmit={onSubmit} />, { fetchShorten });
}

describe("Link del menú del formulario", () => {
  it("al pegar un link largo, el mismo campo pasa al link corto y dice cuál es el destino", async () => {
    open();
    await userEvent.setup().click(field());
    fireEvent.paste(field(), { clipboardData: { getData: () => LONG } });
    await waitFor(() => expect(field().value).toBe(SHORT));
    expect(screen.getByText(new RegExp(`Link acortado.*Destino: ${LONG.slice(0, 40)}`))).toBeTruthy();
  });

  it("al escribir un link y salir del campo, también se acorta", async () => {
    open();
    setValue(LONG);
    fireEvent.blur(field());
    await waitFor(() => expect(field().value).toBe(SHORT));
  });

  it("un link que ya es corto (o propio) no llama al servidor", async () => {
    const fetcher = vi.fn(shortener);
    open(fetcher);
    setValue(SHORT);
    fireEvent.blur(field());
    expect(fetcher).not.toHaveBeenCalled();
    expect(field().value).toBe(SHORT);
  });

  it("un link inválido no se manda a acortar", async () => {
    const fetcher = vi.fn(shortener);
    open(fetcher);
    setValue("esto-no-es-un-link");
    fireEvent.blur(field());
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("si el servicio falla avisa sin bloquear: el link queda como está y se reintenta al guardar", async () => {
    open(async () => Promise.reject(new TypeError("Failed to fetch")));
    setValue(LONG);
    fireEvent.blur(field());
    expect(await screen.findByText(/No se pudo acortar ahora; se intentará de nuevo al guardar/)).toBeTruthy();
    expect(field().value).toBe(LONG);
  });

  it("si la persona siguió editando mientras se acortaba, no se le pisa lo que escribió", async () => {
    let release: (items: Awaited<ReturnType<ShortenFetcher>>) => void = () => undefined;
    const slow: ShortenFetcher = (urls) => new Promise((resolve) => (release = () => resolve(urls.map((url) => ({ url, status: "created" as const, shortUrl: SHORT, code: "x" })))));
    open(slow);
    fireEvent.paste(field(), { clipboardData: { getData: () => LONG } });
    setValue("https://otro.example.com/");
    release([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(field().value).toBe("https://otro.example.com/");
  });

  it("guardar justo al salir del campo no se pierde: el botón sigue activo mientras se acorta", async () => {
    const slow: ShortenFetcher = () => new Promise(() => undefined); // nunca responde
    const onSubmit = vi.fn(async (_d: RecordDraft) => true);
    const user = userEvent.setup();
    open(slow, onSubmit);
    await user.type(screen.getByLabelText(/^Área/), "Tropical");
    await user.type(screen.getByLabelText(/^Mesa/), "M1");
    setValue("https://menu.example.com/carta");
    await user.click(screen.getByRole("button", { name: "Agregar pieza" })); // el clic provoca el blur y el acortado
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it("al guardar entrega el link corto", async () => {
    const onSubmit = vi.fn(async (_d: RecordDraft) => true);
    const user = userEvent.setup();
    open(shortener, onSubmit);
    await user.type(screen.getByLabelText(/^Área/), "Tropical");
    await user.type(screen.getByLabelText(/^Mesa/), "M1");
    await user.click(field());
    fireEvent.paste(field(), { clipboardData: { getData: () => LONG } });
    await waitFor(() => expect(field().value).toBe(SHORT));
    await user.click(screen.getByRole("button", { name: "Agregar pieza" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].menuUrl).toBe(SHORT);
  });
});
