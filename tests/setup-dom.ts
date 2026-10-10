import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom no trae matchMedia: MUI lo usa para los breakpoints (useMediaQuery).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}

// jsdom tampoco trae ResizeObserver (el visor del PDF y el virtualizador lo usan); no hay layout, así que no avisa de nada.
if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

afterEach(() => {
  cleanup();
});
