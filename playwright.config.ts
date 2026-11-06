import { defineConfig, devices } from "@playwright/test";

// The demo path runs against the local build by default and against the live site with E2E_URL.
const baseURL = process.env.E2E_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.E2E_URL
    ? undefined
    : { command: "npm run build && npm run preview -w apps/web", url: baseURL, reuseExistingServer: true },
});
