// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { Toaster } from "sonner";
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
      <Toaster />
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
  it("muestra la notificación", async () => {
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

  it("notificaciones de otros grupos conviven sin perderse", async () => {
    const send = setup();
    send({ message: "Error de almacenamiento", severity: "error", group: "qr-batch" });
    send({ message: "Pieza eliminada", group: "records" });
    expect((await screen.findAllByText("Error de almacenamiento")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Pieza eliminada")).length).toBeGreaterThan(0);
  });
});
