// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QrLogo } from "@/services/qr-produccion/schemas/qr-style";

import { LogoControls } from "./LogoControls";

const geometry = { viewBox: [0, 0, 100, 100], nodes: [{ type: "rect", x: 0, y: 0, w: 100, h: 100, fill: "#112233" }] };
const logo = (sizePct: number) => ({ geometry, sizePct, marginModules: 1, color: null, fileName: "viejo.svg" }) as unknown as QrLogo;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("controles del logo", () => {
  it("si cambias el tamaño mientras sube un logo nuevo, el tamaño elegido se conserva", async () => {
    let answer!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const onChange = vi.fn();
    const { rerender } = render(<LogoControls logo={logo(20)} disabled={false} onChange={onChange} />);

    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'], "nuevo.svg", { type: "image/svg+xml" });
    await userEvent.setup().upload(screen.getByTestId("logo-input"), file);
    rerender(<LogoControls logo={logo(12)} disabled={false} onChange={onChange} />); // la persona movió el slider durante la subida
    answer(new Response(JSON.stringify({ geometry }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ sizePct: 12, fileName: "nuevo.svg" });
  });
});
