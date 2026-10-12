import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// server-only lanza un error fuera de la capa react-server: en tests se sustituye.
const serverOnlyStub = fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true, alias: { "server-only": serverOnlyStub } },
  test: {
    projects: [
      { extends: true, test: { name: "unit", environment: "node", include: ["src/**/*.test.ts"] } },
      {
        extends: true,
        test: { name: "dom", environment: "jsdom", include: ["src/**/*.test.tsx"], setupFiles: ["tests/setup-dom.ts"] },
      },
      {
        extends: true,
        test: { name: "integration", environment: "node", include: ["tests/integration/**/*.test.ts"], testTimeout: 60_000 },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/**", "src/schemas/**"],
      thresholds: { lines: 85 },
    },
  },
});
