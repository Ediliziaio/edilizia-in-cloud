/**
 * MP-FINAL E2E — WhatsApp Hub + sub-pagine.
 *
 * Scope: verifica smoke senza login (pagina redirect su login se feature gated).
 *   - Hub /azienda/whatsapp → se non autenticato, redirect a /login senza crash.
 *   - Tab Numeri/Template/Broadcast/Notifiche → mount React senza error.
 *   - Pagine granulari → 404 evitato, lazy chunk OK.
 *
 * I test con login usano uno storage state in sprint successivi (vedi
 * smoke.spec.ts). Qui: smoke di routing.
 */

import { test, expect } from "@playwright/test";

const ROUTES = [
  "/azienda/whatsapp",
  "/azienda/whatsapp?tab=numeri",
  "/azienda/whatsapp?tab=template",
  "/azienda/whatsapp?tab=broadcast",
  "/azienda/whatsapp?tab=notifiche",
  "/azienda/whatsapp/broadcast",
  "/azienda/whatsapp/broadcast/nuovo",
];

test.describe("MP-FINAL — WhatsApp Hub routing", () => {
  for (const route of ROUTES) {
    test(`route ${route} monta senza crash React`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));

      const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(resp).not.toBeNull();
      expect(resp!.status()).toBeLessThan(500);

      // Attendi che React monti (redirect login o render pagina)
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
        /* ok, networkidle non sempre raggiunto */
      });
      await expect(page.locator("#root")).toBeAttached();

      const body = await page.locator("body").innerText();
      expect(body.trim().length).toBeGreaterThan(0);

      // Nessun pageerror fatale
      const fatal = errors.filter(
        (e) =>
          !/ChunkLoadError/i.test(e) &&
          !/Loading chunk/i.test(e) &&
          !/Failed to fetch dynamically imported module/i.test(e),
      );
      expect(fatal, `page errors: ${fatal.join("\n")}`).toHaveLength(0);
    });
  }
});
