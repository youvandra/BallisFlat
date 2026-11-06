import { defineConfig, devices } from "@playwright/test";

// README screenshots against the mock build. Run: npx playwright test -c scripts/screenshots/screenshots.config.ts
export default defineConfig({
  testDir: ".",
  testMatch: "capture.ts",
  use: { baseURL: "http://localhost:4173", timezoneId: "Europe/London", locale: "en-GB" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "VITE_DATA_MODE=mock npm run build && npm run preview -w apps/web",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    cwd: "../..",
  },
});
