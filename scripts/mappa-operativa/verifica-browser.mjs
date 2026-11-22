/** Playwright con pagine reali e sorgenti di test isolate. Nessuna sessione di produzione. */
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, writeFile, access } from "node:fs/promises";
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import { chromium, expect } from "@playwright/test";

const cartella = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(cartella, "../..");
const soloServer = process.argv.includes("--serve");
const output = process.argv.slice(2).find(a => a !== "--serve") ?? path.join(os.tmpdir(), "eic-mappa-operativa-evidenze");
await mkdir(output, { recursive: true });
const mock = path.join(cartella, "browser-fixture.mjs");
const moduli = [
  "@/contexts/AuthContext", "@/hooks/usePermissions", "@/hooks/useCompanyStaffUsers",
  "@/hooks/useCompanyBase", "@/hooks/useGoogleCalendarSync", "@/hooks/useAppleCalendarSync",
  "@/hooks/useOutlookCalendarSync", "@/hooks/useWorkCalendarData", "@/hooks/campo/useCampoAssignments",
  "@/integrations/supabase/client",
];
const server = await createServer({
  root, configFile: false, envFile: false, plugins: [react(), {
    name: "fixture-mappa",
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        if (req.url?.startsWith("/qa-tiles/")) {
          res.setHeader("Content-Type", "image/svg+xml");
          res.end('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2ea"/><path d="M0 44h256M69 0v256M0 190h256M155 0v256" stroke="#c4d4cc" stroke-width="2"/></svg>');
          return;
        }
        if (!["/azienda/marketing/calendario", "/azienda/calendario", "/campo/calendario"].includes(req.url?.split("?")[0])) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        void s.transformIndexHtml(req.url, '<!doctype html><html lang="it"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/scripts/mappa-operativa/browser-entry.tsx"></script></html>')
          .then(html => res.end(html), next);
      });
    },
  }], resolve: { alias: [...moduli.map(find => ({ find, replacement: mock })), { find: "@", replacement: path.join(root, "src") }] },
  define: { "import.meta.env.VITE_MAPPA_OPERATIVA_TILE_URL": JSON.stringify("/qa-tiles/{z}/{x}/{y}.svg") },
  cacheDir: path.join(output, "vite-cache"),
  optimizeDeps: { entries: ["scripts/mappa-operativa/browser-entry.tsx"] },
  server: { host: "127.0.0.1", port: 8181, strictPort: true },
});
if (soloServer) {
  await server.listen();
  console.log("Calendari di prova su http://127.0.0.1:8181/azienda/marketing/calendario");
  await new Promise(resolve => process.once("SIGINT", resolve));
  await server.close();
  process.exit(0);
}
const chrome = await (async () => {
  try { await access(chromium.executablePath()); return chromium.executablePath(); } catch { /* fallback al browser installato */ }
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  for (const folder of (await readdir(cache)).filter(n => n.startsWith("chromium_headless_shell-")).reverse()) {
    const file = path.join(cache, folder, "chrome-headless-shell-mac-arm64/chrome-headless-shell");
    try { await access(file); return file; } catch { /* altra architettura */ }
  }
  return undefined;
})();
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: chrome, headless: true });
  const esiti = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: "it-IT", timezoneId: "Europe/Rome" });
    const page = await context.newPage();
    page.setDefaultTimeout(14000);
    const errors = [];
    const requests = [];
    page.on("pageerror", e => { errors.push(e.message); console.error(e.message); });
    page.on("request", req => { if (req.url().includes("/qa-tiles/")) requests.push(req.url()); });
    await page.route("**/*", route => route.request().url().startsWith("http://127.0.0.1:8181/") ? route.continue() : route.abort());
    await page.goto("http://127.0.0.1:8181/azienda/marketing/calendario", { waitUntil: "networkidle", timeout: 120000 });
    await expect(page.getByRole("heading", { name: /Calendario/ }).first()).toBeVisible();
    await page.screenshot({ path: path.join(output, `calendario-prima-mappa-${viewport.width}.png`) });
    assert.equal(requests.length, 0);
    const mappa = page.getByRole("region", { name: "Mappa operativa", exact: true });
    await expect(mappa).toHaveCount(0);
    await page.getByRole("tab", { name: "Mappa", exact: true }).click();
    await expect(mappa).toBeVisible();
    await expect(page.getByText("5 in elenco · 3 sulla mappa")).toBeVisible();
    await expect(mappa.getByTitle("Offerta est")).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione)), ["vista"]);
    await mappa.getByTitle("Offerta est").click();
    const offerta = page.getByRole("article").filter({ hasText: "Offerta est" });
    await expect(offerta.getByRole("button", { name: "Apri scheda" })).toBeVisible();
    await offerta.getByRole("button", { name: "Apri scheda" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Calcola percorso", exact: true }).click();
    await expect(page.getByText("Totale parziale · 9,5 km · 16 min")).toBeVisible();
    await expect(page.getByText("Tratta mancante")).toBeVisible();
    await page.evaluate(() => window.spostaDemo());
    await expect(page.getByText("13:00–14:00")).toBeVisible();
    await expect(page.getByText("Totale parziale · 9,5 km · 16 min")).toHaveCount(0);
    await page.getByRole("button", { name: "Calcola percorso", exact: true }).click();
    await expect(page.getByText("Totale parziale · 9,5 km · 16 min")).toBeVisible();
    const senza = page.getByRole("article").filter({ hasText: "Finiture da confermare" });
    await expect(senza.getByText("Indirizzo mancante")).toBeVisible();
    await senza.getByRole("button", { name: /Finiture da confermare/ }).click();
    await senza.getByRole("button", { name: "Posiziona pin" }).click();
    await page.getByLabel("Latitudine", { exact: true }).fill("45.449");
    await page.getByLabel("Longitudine", { exact: true }).fill("9.203");
    await page.getByRole("button", { name: "Salva pin" }).click();
    await expect(page.getByText("5 in elenco · 4 sulla mappa")).toBeVisible();
    const prima = await page.evaluate(() => window.mappaFixture.calls.length);
    await page.getByRole("tab", { name: "Calendario", exact: true }).click();
    await page.getByRole("tab", { name: "Mappa", exact: true }).click();
    await expect(page.getByText("5 in elenco · 4 sulla mappa")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.mappaFixture.calls.length)).toBe(prima + 1);
    assert.deepEqual(await page.evaluate(n => window.mappaFixture.calls.slice(n).map(c => c.azione), prima), ["vista"]);
    await page.getByRole("article").filter({ hasText: "Finiture da confermare" }).getByRole("button", { name: "Chi è più vicino?" }).click();
    await page.getByRole("button", { name: "Valuta candidati" }).click();
    await expect(page.getByText("Tra i candidati valutati · 5 su 20")).toBeVisible();
    await page.evaluate(() => { window.mappaFixture.routing = false; });
    await page.getByRole("button", { name: "Valuta candidati" }).click();
    await expect(page.getByText("Distanza in linea d’aria", { exact: true })).toBeVisible();
    const vendite = await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione));
    const inVista = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(inVista, true);
    await page.screenshot({ path: path.join(output, `mappa-vendite-${viewport.width}.png`), fullPage: true });

    await page.goto("http://127.0.0.1:8181/azienda/calendario", { waitUntil: "networkidle", timeout: 120000 });
    await expect(page.getByRole("heading", { name: "Calendario lavori" })).toBeVisible();
    await page.getByRole("button", { name: "Pianificazione team" }).click();
    await page.getByRole("button", { name: "Mappa", exact: true }).click();
    await expect(page.getByText("2 in elenco · 2 sulla mappa")).toBeVisible();
    await page.getByRole("button", { name: /DEM-01/ }).click();
    await expect(page.getByText(/Alba Bianchi · Presenza registrata/)).toBeVisible();
    await expect(page.getByText(/Alba Bianchi · Uscita registrata/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Apri commessa" })).toHaveAttribute("href", "/azienda/ordini/a");
    await page.getByRole("button", { name: /DEM-02/ }).click();
    await expect(page.getByText("Bruno Monti", { exact: false }).filter({ hasText: "Assegnato" })).toBeVisible();
    await expect(page.getByText(/32,4 km · viaggi partiti/)).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `mappa-lavori-${viewport.width}.png`), fullPage: true });
    const lavori = await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione));

    await page.goto("http://127.0.0.1:8181/campo/calendario", { waitUntil: "networkidle", timeout: 120000 });
    await expect(page.getByRole("heading", { name: "I miei lavori" })).toBeVisible();
    await page.getByRole("button", { name: "Mappa", exact: true }).click();
    await expect(page.getByText("2 in elenco · 2 sulla mappa")).toBeVisible();
    await page.getByRole("button", { name: /Posa serramenti/ }).click();
    await expect(page.getByText("Assegnato a te")).toBeVisible();
    await expect(page.getByText(/Alba Bianchi · Presenza registrata/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Apri commessa" })).toHaveAttribute("href", /^\/campo\/lavoro\/a/);
    await page.screenshot({ path: path.join(output, `mappa-campo-${viewport.width}.png`), fullPage: true });
    const campo = await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione));
    assert.deepEqual(errors, []);
    esiti.push({ viewport, vendite, lavori, campo, tileDiTest: requests.length, erroriPagina: errors });
    await context.close();
  }
  await writeFile(path.join(output, "browser.json"), JSON.stringify(esiti, null, 2));
  console.log(JSON.stringify(esiti));
} finally {
  await browser?.close();
  await server.close();
}
