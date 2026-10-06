import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import { NotificationsProvider, useNotify, type NotifyOptions } from "./NotificationsProvider";

type Notify = (options: NotifyOptions) => void;

function Capture({ onReady }: { onReady: (notify: Notify) => void }) {
  const notify = useNotify();
  useEffect(() => {
    onReady(notify);
  }, [onReady, notify]);
  return null;
}

function setup() {
  const holder: { notify?: Notify } = {};
  render(
    <NotificationsProvider>
      <Capture
        onReady={(notify) => {
          holder.notify = notify;
        }}
      />
    </NotificationsProvider>,
  );
  return (options: NotifyOptions) => act(() => holder.notify?.(options));
}

describe("NotificationsProvider", () => {
  it("muestra la notificación con su severidad", async () => {
    const send = setup();
    send({ message: "Excel importado: 240 piezas válidas", severity: "success" });
    expect(await screen.findByText("Excel importado: 240 piezas válidas")).toBeTruthy();
  });

  it("una notificación del mismo grupo reemplaza a la visible", async () => {
    const send = setup();
    send({ message: "PDF generado", severity: "success", group: "export" });
    await screen.findByText("PDF generado");
    send({ message: "Descarga iniciada", group: "export" });
    expect(await screen.findByText("Descarga iniciada")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("PDF generado")).toBeNull());
  });

  it("encola notificaciones de otros grupos sin perderlas", async () => {
    const send = setup();
    send({ message: "Error de almacenamiento", severity: "error", group: "qr-batch" });
    send({ message: "Pieza eliminada", group: "records" });
    await screen.findByText("Error de almacenamiento");
    expect(screen.queryByText("Pieza eliminada")).toBeNull();

    act(() => screen.getByRole("button", { name: /close|cerrar/i }).click());
    expect(await screen.findByText("Pieza eliminada")).toBeTruthy();
  });
});
