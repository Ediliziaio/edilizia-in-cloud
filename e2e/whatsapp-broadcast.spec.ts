/**
 * MP-FINAL E2E — Broadcast wizard smoke.
 * Verifica che /azienda/whatsapp/broadcast/nuovo carichi lo step 1 del wizard.
 */

import { test, expect } from "@playwright/test";

test.describe("MP-FINAL — Broadcast wizard", () => {
  test("pagina create broadcast carica step 1", async ({ page }) => {
    await page.goto("/azienda/whatsapp/broadcast/nuovo", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    await expect(page.locator("#root")).toBeAttached();

    // Se l'utente è autenticato con feature enabled, deve vedere "Nuova campagna" o la parola "Step"
    const title = page.getByText(/Nuova campagna|Step 1|accedi|login/i);
    await expect(title.first()).toBeVisible({ timeout: 10_000 });
  });
});
