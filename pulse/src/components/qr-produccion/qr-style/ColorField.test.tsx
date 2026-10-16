// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HexColor } from "@/types";

import { ColorField } from "./ColorField";

const field = (onChange: (c: HexColor) => void) => (
  <ColorField label="Módulos" value={"#000000" as HexColor} custom autoLabel="Igual que la plantilla" onChange={onChange} onReset={() => {}} />
);

afterEach(cleanup);

describe("campo de color", () => {
  it("confirma un solo cambio tras una ráfaga del selector", async () => {
    const onChange = vi.fn();
    render(field(onChange));
    const picker = screen.getByLabelText("Módulos");
    fireEvent.change(picker, { target: { value: "#112233" } });
    fireEvent.change(picker, { target: { value: "#ff0000" } });
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onChange).toHaveBeenCalledWith("#FF0000");
  });

  it("si se sale de la pantalla antes de los 150 ms, el color elegido no se pierde", () => {
    const onChange = vi.fn();
    const { unmount } = render(field(onChange));
    fireEvent.change(screen.getByLabelText("Módulos"), { target: { value: "#ff0000" } });
    expect(onChange).not.toHaveBeenCalled();
    unmount();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("#FF0000");
  });
});
