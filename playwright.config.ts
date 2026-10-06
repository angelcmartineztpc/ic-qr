import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run build && npm start",
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      PORT: String(port),
      APP_ORIGINS: `http://localhost:${port}`,
      APP_ALLOWED_HOSTS: `localhost:${port}`,
      ALLOW_UNAUTHENTICATED: "true",
      ALLOW_LOCAL_STORAGE_IN_PROD: "true",
      STORAGE_LOCAL_DIR: ".data/e2e-storage",
      STORAGE_PUBLIC_BASE_URL: `http://localhost:${port}/api/storage`,
      LOG_LEVEL: "warn",
    },
  },
});
