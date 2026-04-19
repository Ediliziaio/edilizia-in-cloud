/**
 * Configurazione Playwright — Smoke E2E per Edilizia in Cloud.
 *
 * Scope attuale (fase 1):
 *   - Un solo browser (chromium) per velocità e determinismo.
 *   - Target: http://localhost:8080 — porta di default del dev server Vite.
 *   - WebServer: riutilizza il dev server se già attivo, altrimenti lo avvia.
 *
 * Prerequisiti (solo prima run):
 *     bunx playwright install chromium
 *
 * Run locale:
 *     bun run test:e2e              # headless
 *     bun run test:e2e -- --headed  # con UI
 *
 * Note:
 *   - Non esiste ancora un utente di test con dati mock in Supabase; i primi
 *     smoke testano solo il rendering senza sessione autenticata.
 *   - Quando aggiungeremo test che richiedono login, usare Playwright
 *     "storage state" (auth setup project) invece di ripetere il login
 *     in ogni test.
 *   - CI: workers=1 per ridurre flakiness; locale: undefined = default.
 */

import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: !isCI,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "bun run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !isCI,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
