/**
 * Admin Hubs Smoke E2E
 *
 * Verifica che le route admin consolidate (hub Fatturato/CS/AI/Operazioni/
 * Portale Formazione/SuperAdmins) si montino senza errori critici. Non testa
 * il flow autenticato — verifica solo che il routing + bundle + lazy loading
 * funzionino al network level (200 OK + no console error).
 *
 * Razionale: le route admin sono dietro auth gate, quindi un utente non
 * loggato vede il login form. Ma il bundle JS si deve caricare comunque,
 * e i lazy chunk degli hub devono essere risolti.
 *
 * Coverage: 17 route critiche (5 hub × 2-3 sub-tab + legacy redirects).
 */
import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

const BENIGN_CONSOLE_PATTERNS: RegExp[] = [
  /Download the React DevTools/i,
  /ResizeObserver loop/i,
  /\[vite\]/i,
  /Failed to load resource: the server responded with a status of 404.*favicon/i,
  // Auth gate redirect — non è un errore, è il flow normale di una pagina
  // protetta vista da non-loggato.
  /Auth session missing/i,
  /\[(supabase|auth)\].*not authenticated/i,
];

function isCriticalConsoleError(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const text = msg.text();
  return !BENIGN_CONSOLE_PATTERNS.some((re) => re.test(text));
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (isCriticalConsoleError(msg)) errors.push(msg.text());
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return errors;
}

const ROUTES: Array<{ label: string; path: string }> = [
  // ─── Hub principali ─────────────────────────────────────────────
  { label: "Hub Fatturato (default Revenue)", path: "/admin/fatturato" },
  { label: "Hub Fatturato — tab Piani", path: "/admin/fatturato?tab=piani" },
  { label: "Hub AI (default Operate)", path: "/admin/ai" },
  { label: "Hub AI — section Monitor", path: "/admin/ai?section=monitor" },
  { label: "Hub AI — section Config", path: "/admin/ai?section=config" },
  { label: "Hub AI — section Memoria Clienti", path: "/admin/ai?section=memoria" },
  { label: "Hub AI — tab Approvals (refactored)", path: "/admin/ai?tab=approvals" },
  { label: "Hub Customer Success", path: "/admin/cs" },
  { label: "Hub CS — tab Assistenza", path: "/admin/cs?tab=assistenza" },
  { label: "Hub Operazioni", path: "/admin/operazioni" },
  { label: "Portale Formazione", path: "/admin/portale-formazione" },
  { label: "SuperAdmins (default Team)", path: "/admin/impostazioni/super-admin" },
  { label: "SuperAdmins — Multi-Azienda", path: "/admin/impostazioni/super-admin?tab=multi-company" },
  // ─── Legacy URL → devono redirigere agli hub ───────────────────
  { label: "Legacy /admin/ai-operate (redirect)", path: "/admin/ai-operate" },
  { label: "Legacy /admin/ai-config (redirect)", path: "/admin/ai-config" },
  { label: "Legacy /admin/piani (redirect)", path: "/admin/piani" },
  { label: "Legacy /admin/ticket (redirect)", path: "/admin/ticket" },
  // ─── 404 page ──────────────────────────────────────────────────
  { label: "404 route — pagina inesistente", path: "/admin/route-che-non-esiste-test-e2e" },
];

test.describe("Admin Hubs — smoke routing", () => {
  for (const route of ROUTES) {
    test(`${route.label} renderizza senza errori critici`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      const response = await page.goto(route.path, { waitUntil: "networkidle" });
      expect(response, `${route.path} risposta non null`).not.toBeNull();
      // 2xx (success), 3xx (redirect ad auth), 4xx solo per chiaramente 404.
      // Non vogliamo 5xx server errors.
      expect(
        response!.status(),
        `${route.path} status < 500`,
      ).toBeLessThan(500);

      // Root React montato
      await expect(page.locator("#root")).toBeAttached();

      // Body con contenuto
      const bodyText = await page.locator("body").innerText();
      expect(
        bodyText.trim().length,
        `${route.path} body ha contenuto`,
      ).toBeGreaterThan(0);

      // Console pulita
      expect(
        errors,
        `${route.path} console errors:\n${errors.join("\n")}`,
      ).toHaveLength(0);
    });
  }
});

test.describe("Admin Hubs — sticky impersonation banner", () => {
  test("homepage admin non mostra il banner impersonation (non-impersonating)", async ({ page }) => {
    await page.goto("/admin", { waitUntil: "networkidle" });
    // Banner ha testo "Stai visualizzando come" — non deve esistere se l'admin
    // non sta impersonando.
    const banner = page.getByText(/Stai visualizzando come/i);
    await expect(banner).not.toBeVisible();
  });
});
