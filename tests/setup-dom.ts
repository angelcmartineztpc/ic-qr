import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom no trae matchMedia: MUI lo usa para los breakpoints (useMediaQuery).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
});
