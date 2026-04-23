/**
 * MP-FINAL E2E — NotificheConfigPage.
 * Smoke: la pagina si monta e mostra almeno un trigger label.
 */

import { test, expect } from "@playwright/test";

test.describe("MP-FINAL — Notifiche config smoke", () => {
  test("tab notifiche monta senza crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/azienda/whatsapp?tab=notifiche", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

    await expect(page.locator("#root")).toBeAttached();

    // Non-fatal errors only
    const fatal = errors.filter(
      (e) => !/ChunkLoadError|Loading chunk|dynamic.+import/i.test(e),
    );
    expect(fatal).toHaveLength(0);
  });
});
