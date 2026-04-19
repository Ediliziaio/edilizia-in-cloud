/**
 * Smoke E2E — garanzie minime che l'app si monti senza crashare.
 *
 * Perché questi test esistono:
 *   - 288 unit test coprono la logica pura (calcolo prezzi, validazioni, etc.)
 *     ma NON rispondono alla domanda: "l'app, quando un utente la apre,
 *     renderizza senza errori?". Un refactor che spacca il router, un import
 *     circolare, o un typo in un provider, passano tutti gli unit test ma
 *     mostrano schermata bianca in browser.
 *
 *   - Playwright qui monta il chunk reale prodotto da Vite, quindi cattura
 *     anche: errori di lazy-chunk, mismatch tra vite config e runtime,
 *     regressioni sul service worker, e console errors silenziosi.
 *
 * Scope intenzionalmente minimo:
 *   - Nessun login (richiederebbe utente Supabase di test + mock RLS).
 *   - Nessun Supabase edge fn chiamata (non-determinismo di rete).
 *   - Solo: "/" risponde, il bundle JS parte, non ci sono errori critici
 *     in console, il DOM contiene almeno il wrapper root di React.
 *
 * Estensioni future (sprint successivo):
 *   - test-login.spec.ts con storage state auth setup.
 *   - test-wizard-preventivatore.spec.ts: happy path 8-step wizard.
 *   - test-form-validation.spec.ts: campo obbligatorio saltato.
 */

import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Ignora rumori benigni che appaiono in dev/build anche in uno stato sano.
 * Teniamo la lista corta e motivata: se qualcosa compare qui senza spiegazione,
 * stiamo nascondendo un bug.
 */
const BENIGN_CONSOLE_PATTERNS: RegExp[] = [
  /Download the React DevTools/i, // dev notice
  /ResizeObserver loop/i, // browser noise, non-actionable
  /\[vite\]/i, // HMR notices
  /Failed to load resource: the server responded with a status of 404.*favicon/i, // missing favicon ok
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

test.describe("Smoke — app boot", () => {
  test("la root path renderizza il wrapper React senza errori critici", async ({ page }) => {
    const errors = collectConsoleErrors(page);

    const response = await page.goto("/", { waitUntil: "networkidle" });
    expect(response, "response non null").not.toBeNull();
    expect(
      response!.status(),
      "status 200 o 3xx (redirect a /login è accettabile)",
    ).toBeLessThan(400);

    // Il root React deve esistere anche se l'app fa redirect interno
    // verso una route di auth: vuol dire che il bundle ha almeno montato
    // il provider tree.
    await expect(page.locator("#root")).toBeAttached();

    // Non vogliamo schermata completamente vuota: almeno UN elemento
    // interattivo o testuale deve essere renderizzato.
    const bodyText = await page.locator("body").innerText();
    expect(
      bodyText.trim().length,
      "body con almeno un carattere di contenuto renderizzato",
    ).toBeGreaterThan(0);

    // Console pulita (al netto di rumore benigno filtrato sopra).
    expect(errors, `console errors: ${errors.join("\n")}`).toHaveLength(0);
  });

  test("titolo pagina impostato (no-crash su <head>)", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const title = await page.title();
    // Non vincoliamo il testo esatto (può cambiare con branding): basta
    // che sia non vuoto → il document.head è stato parsato e React ha
    // avuto modo di renderizzare almeno il titolo iniziale.
    expect(title.trim().length).toBeGreaterThan(0);
  });
});
