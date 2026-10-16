// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Menu, MenuItem, TextField } from "./index";

afterEach(cleanup);

describe("kit de UI", () => {
  it("Button: click, loading deshabilita, `to` renderiza enlace", () => {
    const onClick = vi.fn();
    const { rerender } = render(<MemoryRouter><Button onClick={onClick}>Guardar</Button></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<MemoryRouter><Button loading onClick={onClick}>Guardar</Button></MemoryRouter>);
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<MemoryRouter><Button to="/x">Ir</Button></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Ir" }).getAttribute("href")).toBe("/x");
  });

  it("TextField: etiqueta asociada, ayuda y error", () => {
    const onChange = vi.fn();
    render(<TextField label="Mesa" helperText="Obligatorio" error value="" onChange={onChange} />);
    const input = screen.getByLabelText("Mesa");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.change(input, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("TextField select con MenuItem usa <option>", () => {
    render(<TextField select label="Zoom" value="a" onChange={() => undefined}><MenuItem value="a">A</MenuItem><MenuItem value="b">B</MenuItem></TextField>);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("Dialog: monta solo abierto y Escape pide cerrar", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog open={false} onClose={onClose}><DialogTitle>Hola</DialogTitle></Dialog>);
    expect(screen.queryByText("Hola")).toBeNull();
    rerender(<Dialog open onClose={onClose} aria-labelledby="t"><DialogTitle id="t">Hola</DialogTitle><DialogContent>Cuerpo</DialogContent><DialogActions><Button>Ok</Button></DialogActions></Dialog>);
    expect(screen.getByRole("dialog", { name: "Hola" })).toBeTruthy();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledWith(expect.anything(), "escapeKeyDown");
  });

  it("Alert: rol según severidad, acción y cierre", () => {
    const onClose = vi.fn();
    render(<Alert severity="error" title="Falló" action={<Button>Reintentar</Button>} onClose={onClose}>Detalle</Alert>);
    expect(screen.getByRole("alert").textContent).toContain("Detalle");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it("Menu: abre con ancla y Escape cierra", () => {
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const onClose = vi.fn();
    render(<Menu anchorEl={anchor} open onClose={onClose}><MenuItem>Uno</MenuItem></Menu>);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
