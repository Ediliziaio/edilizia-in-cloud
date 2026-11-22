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
const port = Number(process.env.MAPPA_BROWSER_PORT ?? 8181);
const base = `http://127.0.0.1:${port}`;
const osrmDemo = process.env.MAPPA_DEMO_OSRM_URL?.trim();
const origineCartografia = "https://tiles.openfreemap.org";
if (osrmDemo && !/^http:\/\/127\.0\.0\.1:\d+$/.test(osrmDemo)) throw new Error("La demo richiede OSRM su 127.0.0.1.");
const { percorsoOsrm } = osrmDemo ? await import("../../supabase/functions/mappa-operativa/provider.ts") : {};
const output = process.argv.slice(2).find(a => a !== "--serve") ?? path.join(os.tmpdir(), "eic-mappa-operativa-evidenze");
await mkdir(output, { recursive: true });
const mock = path.join(cartella, "browser-fixture.mjs");
const moduli = [
  "@/contexts/AuthContext", "@/hooks/usePermissions", "@/hooks/useCompanyStaffUsers",
  "@/hooks/useCompanyBase", "@/hooks/useGoogleCalendarSync", "@/hooks/useAppleCalendarSync",
  "@/hooks/useOutlookCalendarSync", "@/hooks/useWorkCalendarData", "@/hooks/campo/useCampoAssignments",
  "@/integrations/supabase/client",
];
const server = !soloServer && process.env.MAPPA_BROWSER_REUSE_SERVER === "1" ? null : await createServer({
  root, configFile: false, envFile: false, plugins: [react(), {
    name: "fixture-mappa",
    configureServer(s) {
      s.middlewares.use((req, res, next) => {
        if (osrmDemo && req.url === "/qa-percorso-osrm" && req.method === "POST") {
          const rispondi = (status, body) => {
            res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify(body));
          };
          void (async () => {
            let corpo = "";
            for await (const chunk of req) {
              corpo += chunk;
              if (corpo.length > 5000) { rispondi(413, { error: "Troppi dati" }); return; }
            }
            const punti = JSON.parse(corpo);
            if (!Array.isArray(punti) || punti.length < 2 || punti.length > 25 || !punti.every(p =>
              (p?.lat === 45.9 && p?.lng === 9.7) ||
              (Number.isFinite(p?.lat) && p.lat >= 45.35 && p.lat <= 45.60 &&
              Number.isFinite(p?.lng) && p.lng >= 8.98 && p.lng <= 9.35))) {
              rispondi(400, { error: "Scegli punti nell’area di Milano della demo" });
              return;
            }
            rispondi(200, await percorsoOsrm(osrmDemo, "driving", punti));
          })().catch(() => rispondi(503, { error: "Motore stradale locale non disponibile" }));
          return;
        }
        if (req.url?.startsWith("/qa-tiles/")) {
          res.setHeader("Content-Type", "image/svg+xml");
          res.end('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2ea"/><path d="M0 44h256M69 0v256M0 190h256M155 0v256" stroke="#c4d4cc" stroke-width="2"/></svg>');
          return;
        }
        const richiesta = req.url?.split("?")[0] ?? "";
        if (!["/azienda/marketing/calendario", "/azienda/calendario", "/campo/calendario", "/azienda/mezzi", "/azienda/manodopera"].includes(richiesta) &&
            !/^\/azienda\/(ordini\/cm-[a-z]|mezzi\/flotta-[a-z]+)$/.test(richiesta)) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        void s.transformIndexHtml(req.url, '<!doctype html><html lang="it"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/scripts/mappa-operativa/browser-entry.tsx"></script></html>')
          .then(html => res.end(html), next);
      });
    },
  }], resolve: { alias: [...moduli.map(find => ({ find, replacement: mock })), { find: "@", replacement: path.join(root, "src") }] },
  define: {
    "import.meta.env.VITE_MAPPA_OPERATIVA_TILE_URL": JSON.stringify(osrmDemo ? "" : "/qa-tiles/{z}/{x}/{y}.svg"),
    "import.meta.env.VITE_MAPPA_OPERATIVA_STYLE_URL": JSON.stringify(osrmDemo ? `${origineCartografia}/styles/liberty` : ""),
    "import.meta.env.VITE_MAPPA_DEMO_REALE": JSON.stringify(!!osrmDemo),
  },
  cacheDir: path.join(output, "vite-cache"),
  optimizeDeps: { entries: ["scripts/mappa-operativa/browser-entry.tsx"] },
  server: { host: "127.0.0.1", port, strictPort: true },
});
if (soloServer) {
  await server.listen();
  console.log(`Calendari di prova su ${base}/azienda/marketing/calendario${osrmDemo ? " con OpenFreeMap e OSRM" : ""}`);
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
async function verificaPartenze(page, viewport) {
  const mappa = page.getByRole("region", { name: "Mappa operativa", exact: true });
  await page.goto(`${base}/azienda/marketing/calendario?scenario=partenze`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("tab", { name: "Mappa", exact: true }).click();
  await page.getByRole("button", { name: "Percorso", exact: true }).click();
  await expect(page.getByRole("button", { name: "Partenza · Sede operativa" })).toBeVisible();
  await expect(mappa.getByTitle(/^[23] tappe vicine$/)).toBeVisible();
  await page.getByRole("button", { name: "Imposta partenza personale" }).click();
  const editor = page.getByRole("region", { name: "Partenza personale", exact: true });
  await expect(editor.getByRole("button", { name: "Cerca indirizzo" })).toHaveCount(0);
  await editor.getByLabel("Latitudine", { exact: true }).fill("45.4489");
  await editor.getByLabel("Longitudine", { exact: true }).fill("9.1748");
  await editor.getByRole("button", { name: "Usa come partenza" }).click();
  await expect(mappa.getByTitle("Partenza personale")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Rientro", exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Calcola percorso" }).click();
  await expect(page.getByText(/^Totale (stimato|parziale)/)).toBeVisible();
  const partenzaPersonale = await page.evaluate(() => window.mappaFixture.calls.find(r => r.azione === "percorso")?.punti[0]);
  assert.deepEqual(partenzaPersonale, { lat: 45.4489, lng: 9.1748 });
  assert.equal(await page.evaluate(() => window.mappaFixture.calls.filter(r => r.azione === "indirizzo").length), 0);
  await mappa.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `mappa-partenza-commerciale-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
  await page.getByRole("combobox", { name: "Partenza", exact: true }).selectOption("sede");
  await expect(page.getByText(/^Totale (stimato|parziale)/)).toHaveCount(0);

  await page.goto(`${base}/azienda/calendario?scenario=giro`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: "Pianificazione team" }).click();
  await page.getByRole("button", { name: "Mappa", exact: true }).click();
  await page.getByRole("button", { name: "Percorso", exact: true }).click();
  const partenza = page.getByRole("combobox", { name: "Partenza", exact: true });
  const rientro = page.getByRole("combobox", { name: "Rientro", exact: true });
  await expect(partenza).toHaveValue("sede");
  await rientro.selectOption("magazzino");
  await expect(mappa.getByTitle("Partenza · Sede operativa")).toBeVisible();
  await expect(mappa.getByTitle("Rientro · Magazzino centrale")).toBeVisible();
  await page.getByRole("button", { name: "Calcola percorso" }).click();
  await expect(page.getByText(/^Totale stimato/)).toBeVisible();
  const giro = await page.evaluate(() => window.mappaFixture.calls.find(r => r.azione === "percorso")?.punti);
  const partenzaSquadra = giro?.[0];
  const rientroSquadra = giro?.at(-1);
  assert.equal(giro?.length, 5);
  assert.deepEqual(partenzaSquadra, { lat: 45.46588, lng: 9.19032 });
  assert.deepEqual(rientroSquadra, { lat: 45.51888, lng: 9.21705 });
  const tratteStrada = mappa.locator(".mappa-linea-stradale");
  const lineaRientro = mappa.locator(".mappa-linea-rientro");
  await expect(tratteStrada).toHaveCount(3);
  assert.equal(new Set(await tratteStrada.evaluateAll(linee => linee.map(linea => linea.getAttribute("stroke")))).size, 3);
  await expect(lineaRientro).toHaveCount(1);
  await expect(lineaRientro).toHaveAttribute("stroke-dasharray", "9 7");
  await expect(page.getByText("Arrivo stimato in sede")).toBeVisible();
  if (osrmDemo) {
    await expect(mappa.locator(".maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Caricamento mappa stradale…")).toHaveCount(0, { timeout: 30_000 });
  }
  await mappa.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `mappa-giro-rientro-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
  const rigaRientro = page.getByRole("button", { name: /^Rientro · .*→ Magazzino centrale$/ });
  await rigaRientro.click();
  await expect(rigaRientro).toHaveAttribute("aria-pressed", "true");
  await expect(lineaRientro).toHaveAttribute("stroke-width", "7");
  await expect(tratteStrada.first()).toHaveAttribute("stroke-opacity", "0.27");
  await page.getByRole("button", { name: "Tutte le tratte" }).click();
  await expect(tratteStrada.first()).toHaveAttribute("stroke-opacity", "0.94");
  await lineaRientro.dispatchEvent("click");
  await expect(rigaRientro).toBeFocused();
  await partenza.selectOption("");
  await expect(rientro).toHaveValue("magazzino");
  await expect(page.getByText(/^Totale stimato/)).toHaveCount(0);
  await expect(mappa.getByTitle("Rientro · Magazzino centrale")).toBeVisible();
  assert.equal(await page.evaluate(() => window.mappaFixture.rpcCalls.includes("mappa_timbrature_gps")), false);
  await page.getByRole("button", { name: "Timbrature GPS", exact: true }).click();
  await expect(page.getByText("2 timbrature sulla mappa")).toBeVisible();
  await expect(page.getByText("Magazzino centrale · App operaio · GPS ±9 m")).toBeVisible();
  await expect(page.getByText("Fuori dal raggio")).toBeVisible();
  await mappa.getByTitle("12:01 · Alba Bianchi · Uscita").click();
  await expect(page.getByRole("button", { name: /^12:01 · Uscita · Alba Bianchi/ })).toHaveAttribute("aria-pressed", "true");
  await expect(mappa.locator(".leaflet-overlay-pane path")).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.mappaFixture.calls.filter(r => r.azione === "percorso").length), 1);
  await mappa.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `mappa-timbrature-gps-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
  await page.getByLabel("Persona", { exact: true }).selectOption({ label: "Ada Commerciale" });
  await expect(page.getByText("1 timbrature sulla mappa")).toBeVisible();
  await page.getByRole("button", { name: "Giorno precedente" }).click();
  await expect(page.getByText("Nessuna timbratura con coordinate per questa selezione.")).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.goto(`${base}/campo/calendario?scenario=partenze`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: "Mappa", exact: true }).click();
  await page.getByRole("button", { name: "Timbrature GPS", exact: true }).click();
  await expect(mappa.getByTitle("07:55 · Ada Commerciale · Entrata")).toBeVisible();
  await expect(mappa.getByTitle("12:01 · Alba Bianchi · Uscita")).toHaveCount(0);
  return { partenzaPersonale, partenzaSquadra, rientroSquadra, tratteGiro: giro.length - 1, verificaGps: true };
}
async function verificaCorrezioni(page, viewport) {
  const mappa = page.getByRole("region", { name: "Mappa operativa", exact: true });
  const calcola = page.getByRole("button", { name: "Calcola percorso", exact: true });
  const cattura = async nome => {
    if (osrmDemo) {
      await expect(mappa.locator(".maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Caricamento mappa stradale…")).toHaveCount(0, { timeout: 30_000 });
    }
    await page.screenshot({ path: path.join(output, `${nome}-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
  };
  const apriVendite = async scenario => {
    await page.goto(`${base}/azienda/marketing/calendario?scenario=${scenario}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByRole("tab", { name: "Mappa", exact: true }).click({ timeout: 45_000 });
    await page.getByRole("button", { name: "Percorso", exact: true }).click();
    await calcola.click();
  };

  let contemporanee = 0;
  let inCorso = 0;
  let indiceRichiesta = 0;
  const ritardaRecupero = async route => {
    const indice = ++indiceRichiesta;
    inCorso++;
    contemporanee = Math.max(contemporanee, inCorso);
    if (indice > 1) await new Promise(resolve => setTimeout(resolve, indice === 2 ? 110 : 700));
    try { await route.fulfill({ response: await route.fetch() }); } finally { inCorso--; }
  };
  if (osrmDemo) await page.route("**/qa-percorso-osrm", ritardaRecupero);
  await apriVendite("copertura");
  if (osrmDemo) await expect(page.getByText(/^Totale parziale · in calcolo/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Totale parziale · [\d,]+ km/)).toBeVisible({ timeout: 30_000 });
  if (osrmDemo) {
    assert.equal(contemporanee, 2);
    await page.unroute("**/qa-percorso-osrm", ritardaRecupero);
  }
  await expect(page.getByText("Pin fuori copertura · Sopralluogo fuori copertura")).toBeVisible();
  await expect(page.getByText("Verifica la copertura dei pin")).toHaveCount(2);
  await expect(page.getByText("Arrivo in sede da verificare")).toBeVisible();
  await expect(page.getByText("Arrivo stimato in sede")).toHaveCount(0);
  await expect(mappa.locator(".mappa-linea-stradale")).toHaveCount(1);
  await expect(mappa.locator(".mappa-linea-rientro")).toHaveCount(1);
  const richiesteCopertura = await page.evaluate(() => window.mappaFixture.calls.filter(r => r.azione === "percorso").map(r => r.punti.length));
  assert.deepEqual(richiesteCopertura, [5, 2, 2]);
  await cattura("mappa-copertura");
  const tappaFuori = page.getByRole("article").filter({ hasText: "Sopralluogo fuori copertura" });
  await tappaFuori.getByRole("button", { name: /Sopralluogo fuori copertura/ }).click();
  await tappaFuori.getByRole("button", { name: "Posiziona pin" }).click();
  const editorPin = page.getByRole("region", { name: "Posiziona pin", exact: true });
  await editorPin.getByLabel("Latitudine", { exact: true }).fill("45.496129");
  await editorPin.getByLabel("Longitudine", { exact: true }).fill("9.234168");
  await editorPin.getByRole("button", { name: "Salva pin" }).click();
  await expect(page.getByText(/^Totale parziale/)).toHaveCount(0);
  await calcola.click();
  await expect(page.getByText(/^Totale stimato/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Pin fuori copertura · Sopralluogo fuori copertura")).toHaveCount(0);
  await expect(mappa.locator(".mappa-linea-stradale")).toHaveCount(3);

  await apriVendite("ritardo");
  await expect(page.getByText("Ritardi inclusi nel rientro")).toBeVisible({ timeout: 30_000 });
  const tempi = await page.evaluate(() => window.mappaFixture.percorsoStradale.tratte.map(t => t.secondi));
  const previsto = 14 * 60 + 5 + Math.ceil((tempi.at(-2) + tempi.at(-1)) / 60);
  const ora = `${String(Math.floor(previsto / 60)).padStart(2, "0")}:${String(previsto % 60).padStart(2, "0")}`;
  await expect(page.locator("dl > div").filter({ hasText: "Arrivo stimato in sede" })).toContainText(ora);
  if (!osrmDemo) assert.equal(ora, "14:21");
  await cattura("mappa-ritardi");

  await page.goto(`${base}/azienda/calendario?scenario=giro`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("button", { name: "Pianificazione team" }).click({ timeout: 45_000 });
  await page.getByRole("button", { name: "Mappa", exact: true }).click();
  await page.getByRole("button", { name: "Percorso", exact: true }).click();
  await page.getByRole("combobox", { name: "Rientro", exact: true }).selectOption("magazzino");
  await calcola.click();
  await expect(page.getByText(/^Totale stimato/)).toBeVisible({ timeout: 30_000 });
  const mattina = page.getByRole("article").filter({ hasText: "08:00–10:00" });
  const pomeriggio = page.getByRole("article").filter({ hasText: "14:00–16:00" });
  await expect(mattina).toContainText("Presenza registrata alle 08:03");
  await expect(pomeriggio).toContainText("Presenza registrata alle 14:02");
  await pomeriggio.getByRole("button", { name: /Posa serramenti/ }).click();
  await expect(pomeriggio).toContainText("Alba Bianchi · Presenza registrata · 14:02");
  await expect(pomeriggio).not.toContainText(/12:01|15:07/);

  const tratti = mappa.locator(".mappa-linea-stradale");
  await expect(mappa.locator(".mappa-freccia-tratta")).toHaveCount(4);
  await mappa.scrollIntoViewIfNeeded();
  // Cerca un punto effettivamente condiviso dalle tratte 2 e 3 nella proiezione a schermo.
  const sovrapposto = await tratti.evaluateAll(([_, seconda, terza]) => {
    const punti = [];
    const n = terza.getTotalLength();
    for (let p = 0.2; p <= 0.8; p += 0.04) {
      const c = terza.getPointAtLength(n * p).matrixTransform(terza.getScreenCTM());
      const trasformato = c.matrixTransform(seconda.getScreenCTM().inverse());
      if (seconda.isPointInStroke(trasformato) && document.elementFromPoint(c.x, c.y) === terza) punti.push({ x: c.x, y: c.y });
    }
    return punti[0] ?? null;
  });
  assert.ok(sovrapposto, "L’itinerario demo deve avere due tratte sovrapposte");
  await page.mouse.click(sovrapposto.x, sovrapposto.y);
  const scelta = mappa.getByRole("group", { name: "Tratte sovrapposte" });
  await expect(scelta.getByRole("button", { name: /^Tratta 2 ·/ })).toBeVisible();
  await expect(scelta.getByRole("button", { name: /^Tratta 3 ·/ })).toBeVisible();
  await cattura("mappa-sovrapposizioni");
  await scelta.getByRole("button", { name: /^Tratta 2 ·/ }).click();
  await expect(scelta).toHaveCount(0);
  const pannello = page.getByRole("region", { name: "Percorso pianificato" });
  await expect(pannello.getByRole("button", { name: /^Tratta 2 ·/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("combobox", { name: "Filtra cantiere" }).selectOption("a");
  await expect(page.getByText("2 di 3 visite incluse")).toBeVisible();
  await calcola.click();
  await expect(page.getByText(/^Totale del giro filtrato/)).toBeVisible();
  await page.getByRole("button", { name: "Mostra giro completo" }).click();
  await expect(page.getByText("2 di 3 visite incluse")).toHaveCount(0);
  await expect(page.getByRole("article").filter({ hasText: "DEM-02" })).toBeVisible();
  await expect(page.getByText(/^Totale del giro filtrato/)).toHaveCount(0);

  return { richiesteCopertura, contemporanee, tratteRecuperate: 2, pinCorretto: true, arrivoConRitardo: ora, visiteDistinte: true, tratteSovrapposte: true, filtro: true };
}
async function verificaStoricoCantieri(page, viewport) {
  const mappa = page.getByRole("region", { name: "Mappa operativa", exact: true });
  await page.goto(`${base}/azienda/marketing/calendario?scenario=partenze&mappa=giorno`, { waitUntil: "networkidle", timeout: 120000 });
  await expect(page.getByRole("tab", { name: "Mappa", exact: true })).toHaveAttribute("aria-selected", "true");
  for (const [i, nome] of ["Rilievo centro", "Offerta est", "Sopralluogo sud"].entries()) {
    await expect(mappa.getByRole("button", { name: nome, exact: true })).toHaveText(String(i + 1));
  }
  await page.getByRole("button", { name: "Percorso", exact: true }).click();
  await page.getByRole("button", { name: "Calcola percorso" }).click();
  const totale = page.getByText(/^Totale stimato ·/);
  await expect(totale).toBeVisible();
  const totaleCommerciale = await totale.textContent();
  await expect(page.getByRole("button", { name: /^Rientro · Sopralluogo sud/ })).toBeVisible();
  if (osrmDemo) {
    await expect(page.getByText("Percorso su strada · OSRM")).toBeVisible();
    await expect(page.getByText("Caricamento mappa stradale…")).toHaveCount(0);
  }
  await page.screenshot({ path: path.join(output, `commerciale-${viewport.width}.png`), fullPage: true });

  const commerciale = page.getByRole("combobox", { name: "Filtra commerciale" });
  await commerciale.selectOption({ label: "Ada Commerciale" });
  const dataGiro = page.getByRole("textbox", { name: "Giorno della mappa" });
  const giornoGiro = await dataGiro.inputValue();
  const zoomIniziale = Number(await mappa.getAttribute("data-livello-zoom"));
  await mappa.getByRole("button", { name: "Zoom in" }).click();
  await expect(mappa).toHaveAttribute("data-livello-zoom", String(zoomIniziale + 1));
  await page.getByRole("tab", { name: "Calendario", exact: true }).click();
  await page.getByRole("tab", { name: "Mappa", exact: true }).click();
  await expect(totale).toHaveText(totaleCommerciale);
  await expect(commerciale.locator("option:checked")).toHaveText("Ada Commerciale");
  await expect(dataGiro).toHaveValue(giornoGiro);
  await expect(mappa).toHaveAttribute("data-livello-zoom", String(zoomIniziale + 1));
  assert.equal(await page.evaluate(() => window.mappaFixture.calls.filter(r => r.azione === "percorso").length), 1);

  await page.getByRole("button", { name: "Giorno successivo", exact: true }).click();
  await expect(totale).toHaveCount(0);
  const giornoDopo = await dataGiro.inputValue();
  assert.notEqual(giornoDopo, giornoGiro);
  await page.getByRole("tab", { name: "Calendario", exact: true }).click();
  await page.getByRole("tab", { name: "Mappa", exact: true }).click();
  await expect(dataGiro).toHaveValue(giornoDopo);
  await page.getByRole("button", { name: "Giorno precedente", exact: true }).click();
  await expect(totale).toHaveText(totaleCommerciale);

  await page.goto(`${base}/azienda/calendario?mappa=storico`, { waitUntil: "networkidle", timeout: 120000 });
  const storico = page.getByRole("region", { name: "Mappa cantieri conclusi" });
  await expect(storico.getByText("5 in elenco · 4 sulla mappa · 1 senza coordinate")).toBeVisible();
  await expect(storico.getByText("Chiuso il 01/01/2026")).toBeVisible();
  await expect(storico.getByText("Chiuso il 19/09/2026")).toBeVisible();
  await expect(mappa.getByRole("button", { name: "Infissi Bicocca", exact: true })).toBeVisible();
  await expect(mappa.getByRole("button", { name: "Cartongessi Certosa", exact: true })).toHaveCount(0);
  await expect(storico.getByText("Lavori annullati demo")).toHaveCount(0);

  await page.getByRole("button", { name: "Pianificazione team" }).click();
  await expect(storico.getByText("6 in elenco · 5 sulla mappa · 1 senza coordinate")).toBeVisible();
  await expect(storico.getByText("Impianti Porta Venezia", { exact: true })).toBeVisible();
  await expect(storico.getByText("Cantiere di altra azienda")).toHaveCount(0);
  await expect(storico.getByText("Contenitore generale demo")).toHaveCount(0);

  if (osrmDemo) {
    await expect(mappa.locator(".maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Caricamento mappa stradale…")).toHaveCount(0, { timeout: 30_000 });
  }
  const nomeNavigli = mappa.getByRole("button", { name: "Ristrutturazione Navigli", exact: true });
  await nomeNavigli.hover();
  await expect(mappa.locator(".leaflet-tooltip").getByText("Ristrutturazione Navigli")).toBeVisible();
  await page.screenshot({ path: path.join(output, `cantieri-conclusi-${viewport.width}.png`), fullPage: true });
  await nomeNavigli.click();
  await expect(storico.getByRole("link", { name: "Apri commessa" })).toHaveAttribute("href", "/azienda/ordini/cm-c");
  await storico.getByRole("button", { name: /Infissi Bicocca DEMO/ }).click();
  await expect(storico.getByRole("link", { name: "Apri commessa" })).toHaveAttribute("href", "/azienda/ordini/cm-e");

  const anno = storico.getByRole("combobox", { name: "Anno dei cantieri" });
  const mese = storico.getByRole("combobox", { name: "Mese dei cantieri" });
  const cerca = storico.getByRole("textbox", { name: "Cerca un cantiere concluso" });
  await anno.selectOption("2025");
  await expect(storico.getByText("1 in elenco · 1 sulla mappa")).toBeVisible();
  await expect(mappa.getByRole("button", { name: "Recupero Bovisa", exact: true })).toBeVisible();
  await anno.selectOption("");
  await expect(mese).toBeDisabled();
  await expect(mappa.getByRole("button", { name: "Restauro senza data", exact: true })).toBeVisible();
  await anno.selectOption("2026");
  await mese.selectOption("09");
  await cerca.fill("DEMO-CM-B");
  await expect(storico.getByText("1 in elenco · 1 sulla mappa")).toBeVisible();
  await expect(mappa.getByRole("button", { name: "Riqualificazione Lambrate", exact: true })).toBeVisible();
  await cerca.fill("Via Durando");
  await expect(storico.getByText("Nessun cantiere concluso per i filtri scelti.")).toBeVisible();

  const richieste = await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione));
  assert.ok(richieste.length > 0);
  assert.ok(richieste.every(azione => azione === "vista"));
  await cerca.fill("Lambrate");
  await mappa.getByRole("button", { name: "Riqualificazione Lambrate", exact: true }).click();
  await storico.getByRole("link", { name: "Apri commessa" }).click();
  await expect(page.getByRole("heading", { name: "Riqualificazione Lambrate" })).toBeVisible();
  await page.getByRole("link", { name: "Torna ai cantieri conclusi" }).click();
  await expect(storico).toBeVisible();
  await expect(mese).toHaveValue("09");
  await expect(cerca).toHaveValue("Lambrate");
  const anniRichiesti = await page.evaluate(() => window.mappaFixture.storicoCalls.map(r => [r.p_anno, r.p_personale]));
  assert.deepEqual(anniRichiesti, [[2026, true], [2026, false], [2025, false], [null, false]]);
  return { totaleCommerciale, anniRichiesti, giroRipristinato: true, storicoTeam: 6, pinTeam: 5, storicoAltroAnno: 1, tooltip: true, richieste };
}

async function verificaMezzi(page, viewport) {
  await page.goto(`${base}/azienda/calendario?mappa=giorno&scenario=flotta`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const mappa = page.getByRole("region", { name: "Mappa operativa", exact: true });
  const gruppo = page.getByRole("group", { name: "Contenuto elenco mappa" });
  const elenco = page.getByRole("region", { name: "Mezzi sulla mappa" });
  await page.getByRole("button", { name: "Pianificazione team" }).click();
  await expect(gruppo.getByRole("button", { name: "Mezzi", exact: true })).toBeVisible();
  assert.equal(await page.evaluate(() => window.mappaFixture.rpcCalls.includes("mappa_mezzi_giorno")), false);
  await gruppo.getByRole("button", { name: "Mezzi", exact: true }).click();
  await expect(page.getByText("3 mezzi · 2 sulla mappa")).toBeVisible();
  const furgone = elenco.getByRole("article").filter({ hasText: "Furgone Alfa" });
  const escavatore = elenco.getByRole("article").filter({ hasText: "Escavatore Beta" });
  const auto = elenco.getByRole("article").filter({ hasText: "Auto Gamma" });
  await expect(furgone).toContainText("32,4 km registrati · 8,1 km stimati");
  await expect(auto).toContainText("2 destinazioni previste · da verificare");
  await expect(auto).toContainText("Posizione da documentare");
  await expect(escavatore).toContainText("812,4 h · lettura contaore");
  await expect(escavatore).not.toContainText("km stimati");

  const punto = mappa.getByRole("button", { name: "Furgone Alfa · Sede operativa", exact: true });
  await punto.click();
  await expect(furgone.getByText(/Ultimo arrivo registrato/)).toBeVisible();
  await expect(furgone.getByText("Contachilometri · verificato")).toBeVisible();
  await expect(furgone.getByRole("link", { name: "Apri scheda mezzo" })).toHaveAttribute("href", /flotta-furgone\?tab=viaggi&giorno=/);
  await expect(mappa.getByRole("button", { name: /Furgone Alfa · Destinazione prevista · Impianto elettrico/ })).toBeVisible();
  if (osrmDemo) await expect(mappa).toHaveAttribute("data-cartografia", "pronta", { timeout: 30_000 });
  await page.screenshot({ path: path.join(output, `mappa-mezzi-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
  assert.equal(await page.evaluate(() => window.mappaFixture.calls.some(r => r.azione === "percorso" || r.azione === "indirizzo")), false);

  await furgone.getByRole("button", { name: "Percorso del mezzo" }).click();
  await expect(page.getByRole("combobox", { name: "Risorsa del percorso" })).toHaveValue("mezzo:flotta-furgone");
  await page.getByRole("button", { name: "Calcola percorso", exact: true }).click();
  await expect(page.getByText(/^Totale stimato ·/)).toBeVisible();
  await gruppo.getByRole("button", { name: "Mezzi", exact: true }).click();
  await elenco.getByRole("combobox", { name: "Tipo di mezzo" }).selectOption("cantiere");
  await expect(page.getByText("1 mezzo · 1 sulla mappa")).toBeVisible();
  await mappa.getByRole("button", { name: /Escavatore Beta · Posa serramenti/ }).click();
  await expect(escavatore.getByText(/Assegnazione al cantiere/)).toBeVisible();
  await expect(escavatore.getByRole("link", { name: "Apri cantiere" })).toHaveAttribute("href", "/azienda/ordini/a");
  await elenco.getByRole("combobox", { name: "Tipo di mezzo" }).selectOption("tutti");
  await page.getByRole("button", { name: "Giorno successivo", exact: true }).click();
  await expect(furgone).toContainText("Posizione da documentare");
  await expect(furgone).toContainText("Destinazione prevista");
  await expect(furgone).not.toContainText("32,4 km");
  await page.getByRole("button", { name: "Giorno precedente", exact: true }).click();
  await page.getByRole("button", { name: "Il mio calendario", exact: true }).click();
  if (!(await elenco.isVisible())) await gruppo.getByRole("button", { name: "Mezzi", exact: true }).click();
  await expect(elenco).toContainText("Furgone Alfa");
  await expect(escavatore).toHaveCount(0);
  await expect(auto).toHaveCount(0);

  await page.goto(`${base}/azienda/calendario?mappa=giorno&scenario=flotta-senza-permesso`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await expect(gruppo).toBeVisible();
  await expect(gruppo.getByRole("button", { name: "Mezzi", exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.mappaFixture.rpcCalls.includes("mappa_mezzi_giorno")), false);
  return { mezziTeam: 3, mezziPersonali: 1, registratiKm: 32.4, stimatiKm: 8.1, oreContatore: 812.4, noRoutingAutomatico: true };
}

async function verificaStoricoMezzo(page, viewport) {
  await page.goto(`${base}/azienda/mezzi?scenario=flotta`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const link = page.getByRole("link", { name: "Storico percorsi di Furgone Alfa" });
  await expect(link).toBeVisible();
  await expect(page.getByRole("link", { name: "Storico percorsi di Escavatore Beta" })).toHaveCount(0);
  const prima = await page.evaluate(() => ({
    storico: window.mappaFixture.viaggiCalls.length,
    cartografia: performance.getEntriesByType("resource").filter(r => r.name.includes("tiles.openfreemap.org")).length,
  }));
  assert.deepEqual(prima, { storico: 0, cartografia: 0 });
  await link.click();
  await expect(page.getByRole("heading", { name: "Furgone Alfa" })).toBeVisible();
  const riepilogo = page.getByLabel("Riepilogo chilometri del periodo");
  const mappa = page.getByRole("region", { name: "Mappa operativa", exact: true });
  const elenco = page.getByRole("region", { name: "Viaggi del periodo" });
  await expect(riepilogo).toContainText("50,9 km");
  await expect(riepilogo).toContainText("8,1 km");
  await expect(mappa.locator(".mappa-linea-indicativa")).toHaveCount(4);
  if (osrmDemo) await expect(mappa).toHaveAttribute("data-cartografia", "pronta", { timeout: 30_000 });
  const chiamate = azione => page.evaluate(a => window.mappaFixture.calls.filter(c => c.azione === a).length, azione);
  assert.equal(await chiamate("percorso"), 0);
  assert.equal(await chiamate("indirizzo"), 0);

  await elenco.getByRole("button", { name: /32,4 km/ }).click();
  await expect(mappa.locator(".mappa-linea-indicativa")).toHaveCount(3);
  if (viewport.width < 1280) {
    await elenco.getByRole("button", { name: "Vai alla mappa" }).click();
    await expect(mappa).toBeInViewport();
  }
  await page.getByRole("button", { name: "Mostra su strada" }).click();
  await expect(mappa.locator(".mappa-linea-stradale")).toHaveCount(3);
  await expect(riepilogo).toContainText("50,9 km");
  await expect(riepilogo).toContainText("8,1 km");
  assert.equal(await chiamate("percorso"), 1);
  await page.screenshot({ path: path.join(output, `storico-percorsi-${viewport.width}.png`), fullPage: true, timeout: 60_000 });

  await page.getByRole("button", { name: "Ultimi 7 giorni" }).click();
  await expect(elenco.getByRole("button")).toHaveCount(3);
  await elenco.getByRole("button", { name: /18,5 km/ }).click();
  await expect(elenco.getByText("Posizione non disponibile per una o entrambe le tappe")).toBeVisible();
  const al = await page.getByLabel("Al", { exact: true }).inputValue();
  await page.getByLabel("Dal", { exact: true }).fill(al);
  await page.getByRole("button", { name: "Applica periodo" }).click();
  await expect(riepilogo).toContainText("32,4 km");
  await expect(riepilogo).toContainText("8,1 km");
  await expect(elenco.getByRole("button")).toHaveCount(2);
  assert.equal(await chiamate("percorso"), 1);
  assert.equal(await chiamate("indirizzo"), 0);

  await page.getByRole("button", { name: "Registro", exact: true }).click();
  await expect(page.getByRole("region", { name: "Viaggi e tratte del mezzo" })).toBeVisible();
  await expect(mappa).toHaveCount(0);
  return { prima, registratiPeriodoKm: 50.9, stimatiPeriodoKm: 8.1, registratiGiornoKm: 32.4, tratteStradali: 3,
    chiamateRouting: 1, geocodifiche: 0, filtroPeriodo: true };
}

async function verificaCarburante(page, viewport) {
  let rilevazioni = 0;
  await page.route("**/api/carburanti-mimit", route => {
    rilevazioni++;
    return route.fulfill({ json: { giorno: "2026-11-22", territori: [
      { chiave: "lombardia", nome: "Lombardia", prezzi: { gasolio: 2.192, benzina: 1.931 } },
      { chiave: "bolzano", nome: "Bolzano", prezzi: { gasolio: 2.211, benzina: 1.952 } },
    ] } });
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.goto(`${base}/azienda/mezzi/flotta-furgone?tab=viaggi&vista=mappa&scenario=carburante`, {
    waitUntil: "domcontentloaded", timeout: 120000,
  });
  await expect(page.getByRole("heading", { name: "Furgone Alfa" })).toBeVisible();
  const percorrenze = page.getByRole("region", { name: "Percorrenze e carburante" });
  await expect(percorrenze).toContainText("5,16");
  assert.equal(await page.evaluate(() => window.mappaFixture.rpcCalls.includes("mezzo_carburante_config")), false);
  assert.equal(rilevazioni, 0);
  await page.getByRole("button", { name: "Consumo e prezzo carburante" }).click();
  const mimit = page.getByRole("region", { name: "Prezzo medio pubblico" });
  await expect(mimit).toContainText("2,192 €/L");
  await expect(mimit).toContainText("1,931 €/L");
  await expect(mimit).toContainText("22/11/2026");
  await mimit.getByLabel("Territorio del prezzo medio").selectOption("bolzano");
  await expect(mimit).toContainText("2,211 €/L");
  assert.equal(rilevazioni, 1);
  await mimit.getByLabel("Territorio del prezzo medio").selectOption("lombardia");
  await page.getByLabel("Decorrenza", { exact: true }).fill("2026-11-21");
  await expect(mimit).toContainText("2,44 €/L");
  await expect(mimit).toContainText("21/11/2026");
  await mimit.getByLabel("Territorio del prezzo medio").selectOption("bolzano");
  await expect(mimit).toContainText("3,66 €/L");
  await mimit.getByLabel("Fonte per le stime da questa data").selectOption("mimit");
  await mimit.getByRole("button", { name: "Salva zona e fonte" }).click();
  await expect(page.getByText(/Per le stime del mezzo · 3 €\/L al netto IVA · MIMIT/)).toBeVisible();
  await mimit.screenshot({ path: path.join(output, `prezzi-mimit-archivio-${viewport.width}.png`) });
  assert.equal(rilevazioni, 1);
  await page.getByLabel("Decorrenza", { exact: true }).fill("2026-11-22");
  await expect(mimit).toContainText("22/11/2026");
  await page.getByLabel("Consumo medio (L/100 km)").fill("10");
  await page.getByLabel("Nuovo prezzo medio aziendale (€/L)").fill("2,00");
  await page.getByRole("button", { name: "Salva parametri" }).click();
  await expect(percorrenze).toContainText("8,10");
  await page.getByRole("link", { name: "Apri commessa demo" }).click();
  const conto = page.getByRole("region", { name: "Economia mezzi e noleggi" });
  await expect(conto.getByRole("region", { name: "Percorrenze e carburante" })).toContainText("5,62");
  await expect(conto.getByRole("table")).toHaveCount(0);
  await page.getByRole("button", { name: "Ritiri e consegne" }).click();
  for (const oda of ["ODA-01", "ODA-02"]) {
    const riga = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: oda, exact: true }) });
    await expect(riga.getByRole("link", { name: "DDT DDT-01" })).toHaveCount(1);
    await expect(riga.getByRole("link", { name: "DDT DDT-02" })).toHaveCount(1);
  }
  await expect(page.getByText("Controllata", { exact: false }).last()).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Includi nel giro ODA-03" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Includi nel giro ODA-01" }).click();
  await page.getByRole("checkbox", { name: "Includi nel giro ODA-02" }).click();
  await expect(page.getByText("Ritiro · Materiali Milano · Via Tarabella 10, Milano · ODA-01, ODA-02")).toBeVisible();
  const materiali = page.getByRole("region", { name: "Ritiri e consegne materiali" });
  const rigaOda = await materiali.getByRole("link", { name: "ODA-01", exact: true }).boundingBox();
  const bozza = await materiali.getByRole("region", { name: "Bozza giro materiali" }).boundingBox();
  assert.ok(rigaOda && bozza);
  if (viewport.width >= 1024) assert.ok(bozza.x > rigaOda.x);
  else assert.ok(bozza.y > rigaOda.y);
  await page.getByRole("button", { name: "Copia il giro" }).click();
  const giro = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(giro.match(/Ritiro ·/g)?.length, 1);
  assert.match(giro, /Rientro · Sede/);
  assert.doesNotMatch(giro, /ODA-03/);
  await page.screenshot({ path: path.join(output, `carburante-commessa-${viewport.width}.png`), fullPage: true, timeout: 60_000,
    style: "[data-sonner-toaster] { visibility: hidden !important; }" });
  const piano = materiali.getByRole("region", { name: "Bozza giro materiali" });
  await piano.getByLabel("Mezzo", { exact: true }).selectOption("flotta-furgone");
  await piano.getByLabel("Autista", { exact: true }).selectOption("autista-demo");
  await piano.getByRole("combobox", { name: "Aggiungi cantiere" }).selectOption("cm-a");
  await piano.getByLabel("Giorno del giro").fill("2026-11-21");
  await piano.getByLabel("Ora di partenza").fill("22:15");
  await piano.getByLabel("Giorno di arrivo, se diverso").fill("2026-11-22");
  await piano.getByLabel("Ora di arrivo").fill("00:40");
  await piano.getByRole("button", { name: "Salva giro" }).click();
  const salvati = materiali.getByRole("region", { name: "Giri salvati" });
  await expect(salvati).toContainText("Furgone Alfa · Mario Demo");
  await expect(salvati).toContainText("2 cantieri · 4 tratte · Pianificato");
  await page.getByRole("link", { name: "Apri altro cantiere demo" }).click();
  const apriRitiri = page.getByRole("button", { name: "Ritiri e consegne" });
  if (await apriRitiri.getAttribute("aria-expanded") !== "true") await apriRitiri.click();
  await expect(salvati).toContainText("2 cantieri · 4 tratte · Pianificato");
  await salvati.getByRole("button", { name: "Compila nel registro" }).click();
  const dialog = page.getByRole("dialog", { name: "Rivedi viaggio" });
  await expect(dialog.getByText("Tratta 4", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Note viaggio")).toHaveValue(/ODA-01, ODA-02/);
  await dialog.getByRole("button", { name: "Chiudi", exact: true }).first().click();
  await expect(salvati).toContainText("Bozza nel registro");
  await salvati.getByRole("button", { name: "Apri viaggio" }).click();
  await expect(dialog.getByText("Tratta 4", { exact: true })).toBeVisible();
  for (const [n, km] of [4, 15.5, 10, 6.5].entries()) {
    await dialog.getByLabel(`Km tratta ${n + 1}`, { exact: true }).fill(String(km));
  }
  await dialog.getByRole("button", { name: "Verifica viaggio" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(salvati).toContainText("Verificato");
  const registro = page.getByRole("region", { name: "Viaggi e tratte della commessa" });
  const riepilogo = registro.getByRole("region", { name: "Percorrenze e carburante" });
  await expect(riepilogo.getByText("10 km", { exact: true })).toBeVisible();
  await expect(registro.getByRole("region", { name: "Viaggi registrati" })).toContainText("1 viaggio");
  await registro.getByRole("button", { name: "Oggi", exact: true }).click();
  await expect(riepilogo).toHaveCount(0);
  await expect(registro).toContainText("Nessun viaggio con tratte e orari nel periodo.");
  await registro.getByRole("button", { name: "Ultimi 30 giorni", exact: true }).click();
  await expect(riepilogo.getByText("10 km", { exact: true })).toBeVisible();
  await expect(registro.getByRole("region", { name: "Viaggi registrati" })).toContainText("1 viaggio");
  await registro.getByRole("button", { name: "Periodo", exact: true }).click();
  await registro.getByLabel("Viaggi dal").fill("2026-11-21");
  await registro.getByLabel("Viaggi al").fill("2026-11-21");
  await expect(riepilogo.getByText("10 km", { exact: true })).toBeVisible();
  await salvati.getByText("Vedi tappe", { exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, `giro-notturno-${viewport.width}.png`), fullPage: true, timeout: 60_000,
    style: "[data-sonner-toaster] { visibility: hidden !important; }" });
  await page.getByRole("link", { name: "Calendario appuntamenti", exact: true }).click();
  await page.getByRole("tab", { name: "Mappa", exact: true }).click();
  await page.getByRole("button", { name: "Percorso", exact: true }).click();
  await page.getByRole("button", { name: "Copia giro", exact: true }).click();
  const agenda = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(agenda, /Rilievo centro/);
  assert.match(agenda, /Sopralluogo sud/);
  await page.goto(`${base}/azienda/ordini/cm-b?scenario=rapportino-trasporti`, { waitUntil: "domcontentloaded" });
  const trasporto = page.getByRole("region", { name: "Trasporto al cantiere" });
  await expect(trasporto.getByRole("listitem")).toHaveCount(0);
  await trasporto.getByRole("button", { name: /Furgone Alfa/ }).click();
  await trasporto.getByRole("button", { name: /Auto Gamma/ }).click();
  await expect(trasporto.getByRole("listitem")).toHaveCount(2);
  await trasporto.getByText("Partenza e km facoltativi").first().click();
  await trasporto.getByRole("listitem").first().getByLabel("Km percorsi all’andata").fill("18,5");
  await expect(trasporto.getByText("18,5 km all’andata", { exact: true })).toBeVisible();
  await trasporto.screenshot({ path: path.join(output, `rapportino-trasporti-${viewport.width}.png`) });
  return { rilevazioniMimit: rilevazioni, trasportiConfermati: 2, euroMezzoPrima: 5.16, euroMezzoDopo: 8.10, euroCommessa: 5.62, ordiniAbbinati: 2, tappeRitiro: 1, ddtMulti: 2, cantieriGiro: 2, tratteGiro: 4, kmSecondoCantiere: 10, viaggiDopoMezzanotte: 0, bozzeDuplicate: 0, giroCrmCopiato: true };
}

try {
  await server?.listen();
  browser = await chromium.launch({ executablePath: chrome, headless: true,
    args: osrmDemo ? ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"] : [] });
  const esiti = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, locale: "it-IT", timezoneId: "Europe/Rome" });
    const page = await context.newPage();
    await page.clock.install({ time: new Date("2026-11-22T07:07:00Z") });
    page.setDefaultTimeout(14000);
    const errors = [];
    const requests = [];
    page.on("pageerror", e => { errors.push(e.message); console.error(e.message); });
    page.on("request", req => { if (req.url().includes("/qa-tiles/")) requests.push(req.url()); });
    const tileVettoriali = [];
    if (osrmDemo) page.on("response", response => {
      if (response.ok() && response.url().startsWith(`${origineCartografia}/planet/`)) tileVettoriali.push(response.url());
    });
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.origin === base || (osrmDemo && url.origin === origineCartografia)) return route.continue();
      return route.abort();
    });
    if (process.env.MAPPA_BROWSER_SOLO_CARBURANTE === "1") {
      const carburante = await verificaCarburante(page, viewport);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      esiti.push({ viewport, carburante, erroriPagina: errors });
      await context.close();
      continue;
    }
    if (process.env.MAPPA_BROWSER_SOLO_STORICO_MEZZO === "1") {
      const storicoMezzo = await verificaStoricoMezzo(page, viewport);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      esiti.push({ viewport, storicoMezzo, erroriPagina: errors });
      await context.close();
      continue;
    }
    if (process.env.MAPPA_BROWSER_SOLO_MEZZI === "1") {
      const mezzi = await verificaMezzi(page, viewport);
      if (osrmDemo) await expect.poll(() => tileVettoriali.length, { timeout: 30_000 }).toBeGreaterThan(0);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      esiti.push({ viewport, mezzi, erroriPagina: errors });
      await context.close();
      continue;
    }
    if (process.env.MAPPA_BROWSER_SOLO_STORICO === "1") {
      const storico = await verificaStoricoCantieri(page, viewport);
      if (osrmDemo) await expect.poll(() => tileVettoriali.length, { timeout: 30_000 }).toBeGreaterThan(0);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      esiti.push({ viewport, richiesteVettoriali: tileVettoriali.length, storico, erroriPagina: errors });
      await context.close();
      continue;
    }
    if (process.env.MAPPA_BROWSER_SOLO_CORREZIONI === "1") {
      const correzioni = await verificaCorrezioni(page, viewport);
      if (osrmDemo) await expect.poll(() => tileVettoriali.length, { timeout: 30_000 }).toBeGreaterThan(0);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      esiti.push({ viewport, richiesteVettoriali: tileVettoriali.length, correzioni, erroriPagina: errors });
      await context.close();
      continue;
    }
    if (process.env.MAPPA_BROWSER_SOLO_GIRO === "1") {
      const nuoveViste = await verificaPartenze(page, viewport);
      if (osrmDemo) await expect.poll(() => tileVettoriali.length, { timeout: 30_000 }).toBeGreaterThan(0);
      assert.deepEqual(errors, []);
      esiti.push({ viewport, richiesteVettoriali: tileVettoriali.length, nuoveViste, erroriPagina: errors });
      await context.close();
      continue;
    }
    await page.goto(`${base}/azienda/marketing/calendario`, { waitUntil: "networkidle", timeout: 120000 });
    await expect(page.getByRole("heading", { name: /Calendario/ }).first()).toBeVisible();
    await page.screenshot({ path: path.join(output, `calendario-prima-mappa-${viewport.width}.png`) });
    assert.equal(requests.length, 0);
    const mappa = page.getByRole("region", { name: "Mappa operativa", exact: true });
    await expect(mappa).toHaveCount(0);
    await page.getByRole("tab", { name: "Mappa", exact: true }).click();
    await expect(mappa).toBeVisible();
    if (osrmDemo) {
      await expect(page.getByText("3 in elenco · 3 sulla mappa")).toBeVisible();
      await expect(mappa.locator(".maplibregl-canvas")).toBeVisible({ timeout: 30_000 });
      await expect.poll(() => tileVettoriali.length, { timeout: 30_000 }).toBeGreaterThan(0);
      await expect(page.getByText("Caricamento mappa stradale…")).toHaveCount(0, { timeout: 30_000 });
      assert.deepEqual(await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione)), ["vista"]);
      await page.getByRole("button", { name: "Percorso", exact: true }).click();
      await page.getByRole("button", { name: "Calcola percorso" }).click();
      await expect(page.getByText("Percorso su strada · OSRM")).toBeVisible();
      await expect(mappa.locator(".leaflet-overlay-pane path").first()).toBeVisible();
      await mappa.scrollIntoViewIfNeeded();
      const strada = await page.evaluate(() => {
        const p = window.mappaFixture.percorsoStradale;
        return { segmenti: p.tratte.length, metri: p.tratte.reduce((sum, t) => sum + t.metri, 0),
          secondi: p.tratte.reduce((sum, t) => sum + t.secondi, 0), coordinateGeometria: p.geometria.length };
      });
      assert.equal(strada.segmenti, 2);
      assert.ok(strada.coordinateGeometria > 30);
      assert.ok(strada.metri > 3000);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(output, `mappa-reale-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
      const nuoveViste = await verificaPartenze(page, viewport);
      assert.deepEqual(errors, []);
      esiti.push({ viewport, richiesteVettoriali: tileVettoriali.length, strada, nuoveViste, erroriPagina: errors });
      await context.close();
      continue;
    }
    await expect(page.getByText("5 in elenco · 3 sulla mappa")).toBeVisible();
    await expect(mappa.getByTitle("Offerta est")).toBeVisible();
    assert.deepEqual(await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione)), ["vista"]);
    if (viewport.width < 768) {
      await page.getByRole("button", { name: "Nascondi elenco" }).click();
      await expect(page.getByRole("button", { name: "Mostra elenco" })).toBeVisible();
      await expect(mappa.getByTitle("Offerta est")).toBeVisible();
    }
    await mappa.getByTitle("Offerta est").click();
    const offerta = page.getByRole("article").filter({ hasText: "Offerta est" });
    await expect(offerta.getByRole("button", { name: "Apri scheda" })).toBeVisible();
    await offerta.getByRole("button", { name: "Apri scheda" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Percorso", exact: true }).click();
    await page.getByRole("button", { name: "Calcola percorso", exact: true }).click();
    await expect(page.getByText("Totale parziale · 9,5 km · 16 min")).toBeVisible();
    await expect(page.getByText("Tratta mancante")).toBeVisible();
    await page.getByRole("button", { name: "Vai alla criticità" }).click();
    await expect(page.getByRole("article").getByRole("button", { name: /Finiture da confermare/ })).toBeFocused();
    await expect(page.getByRole("article").filter({ hasText: "Offerta est" }).getByText("2", { exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, `mappa-percorso-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
    await page.evaluate(() => window.spostaDemo());
    await expect(page.getByText("13:00–14:00")).toBeVisible();
    await expect(page.getByText("Totale parziale · 9,5 km · 16 min")).toHaveCount(0);
    await page.getByRole("button", { name: "Calcola percorso", exact: true }).click();
    await expect(page.getByText("Totale parziale · 9,5 km · 16 min")).toBeVisible();
    await expect(page.getByText("Trasferimento incompatibile · +8 min stimati")).toBeVisible();
    await page.getByRole("button", { name: "Scorri 2 criticità" }).click();
    await expect(page.getByRole("article").getByRole("button", { name: /Sopralluogo sud/ })).toBeFocused();
    await page.screenshot({ path: path.join(output, `mappa-ritardo-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
    await page.getByRole("button", { name: "Da sistemare · 2", exact: true }).click();
    await expect(page.getByRole("link", { name: "Apri viaggio" })).toHaveAttribute("href", /mezzo1\?tab=viaggi.*&viaggio=viaggio2$/);
    await expect(page.getByText("Km da registrare", { exact: false })).toBeVisible();
    const filtriProblemi = page.getByRole("group", { name: "Tipo di criticità" });
    const senza = page.getByRole("article").filter({ hasText: "Finiture da confermare" });
    await filtriProblemi.getByRole("button", { name: "Km 1" }).click();
    await expect(senza).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Apri viaggio" })).toBeVisible();
    await filtriProblemi.getByRole("button", { name: "Posizioni 1" }).click();
    await expect(page.getByRole("link", { name: "Apri viaggio" })).toHaveCount(0);
    await expect(senza.getByText("Indirizzo mancante")).toBeVisible();
    await senza.getByRole("button", { name: /Finiture da confermare/ }).click();
    await page.screenshot({ path: path.join(output, `mappa-da-sistemare-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
    await senza.getByRole("button", { name: "Posiziona pin" }).click();
    await page.getByLabel("Latitudine", { exact: true }).fill("45.449");
    await page.getByLabel("Longitudine", { exact: true }).fill("9.203");
    await page.getByRole("button", { name: "Salva pin" }).click();
    await expect(page.getByText("1 da completare · 1 sulla mappa")).toBeVisible();
    await mappa.getByTitle("Finiture da confermare").click();
    await expect(filtriProblemi.getByRole("button", { name: "Posizioni 1" })).toHaveAttribute("aria-pressed", "true");
    const prima = await page.evaluate(() => window.mappaFixture.calls.length);
    await page.getByRole("tab", { name: "Calendario", exact: true }).click();
    await page.getByRole("tab", { name: "Mappa", exact: true }).click();
    await expect(filtriProblemi.getByRole("button", { name: "Posizioni 1" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Giornata", exact: true }).click();
    await expect(page.getByText("5 in elenco · 4 sulla mappa")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.mappaFixture.calls.length)).toBe(prima + 1);
    assert.deepEqual(await page.evaluate(n => window.mappaFixture.calls.slice(n).map(c => c.azione), prima), ["vista"]);
    await page.getByRole("article").filter({ hasText: "Finiture da confermare" }).getByRole("button", { name: "Chi è più vicino?" }).click();
    await expect(page.getByLabel("Dalle", { exact: true })).toHaveValue("08:15");
    await page.getByLabel("Dalle", { exact: true }).fill("07:30");
    await expect(page.getByRole("button", { name: "Valuta candidati" })).toBeDisabled();
    await page.getByRole("button", { name: "Prima fascia utile" }).click();
    await page.getByRole("button", { name: "2 ore" }).click();
    await expect(page.getByLabel("Alle", { exact: true })).toHaveValue("10:15");
    await page.getByLabel("Dalle", { exact: true }).fill("09:00");
    await page.getByRole("button", { name: "Valuta candidati" }).click();
    await expect(page.getByText("Tra i candidati valutati · 5 su 20")).toBeVisible();
    await expect(page.getByText(/Luca Demo · 4 min di ritardo sul prossimo impegno/)).toBeVisible();
    await expect(page.getByText(/20 min di margine sul prossimo impegno/)).toBeVisible();
    await page.screenshot({ path: path.join(output, `mappa-candidati-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
    await page.getByRole("button", { name: "Rivedi assegnazione" }).click();
    const conferma = page.getByRole("dialog");
    await expect(conferma.locator("#start-time")).toHaveValue("09:00");
    await expect(conferma.locator("#end-time")).toHaveValue("10:15");
    await page.keyboard.press("Escape");
    await expect(conferma).toHaveCount(0);
    await page.evaluate(() => { window.mappaFixture.routing = false; });
    await page.getByRole("button", { name: "Valuta candidati" }).click();
    await expect(page.getByText("Distanza in linea d’aria", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Rivedi assegnazione" })).toHaveCount(0);
    await page.getByRole("region", { name: "Chi è più vicino?", exact: true }).getByRole("button", { name: "Chiudi" }).click();
    await page.getByRole("button", { name: "Chi è più vicino?", exact: true }).first().click();
    await page.getByLabel("Via, civico, CAP e comune").fill("Via Demo 8, Milano");
    await page.getByLabel("Latitudine", { exact: true }).fill("45.449");
    await page.getByLabel("Longitudine", { exact: true }).fill("9.203");
    await page.getByRole("button", { name: "Usa come destinazione" }).click();
    await page.evaluate(() => { window.mappaFixture.routing = true; });
    await page.getByLabel("Alle", { exact: true }).fill("10:15");
    await page.getByRole("button", { name: "Valuta candidati" }).click();
    await page.getByRole("button", { name: "Rivedi assegnazione" }).click();
    await expect(conferma.locator("#end-time")).toHaveValue("10:15");
    await expect(conferma.getByText("Via Demo 8, Milano", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(conferma).toHaveCount(0);
    const vendite = await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione));
    const inVista = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(inVista, true);
    await page.screenshot({ path: path.join(output, `mappa-vendite-${viewport.width}.png`), fullPage: true, timeout: 60_000 });

    await page.goto(`${base}/azienda/calendario`, { waitUntil: "networkidle", timeout: 120000 });
    await expect(page.getByRole("heading", { name: "Calendario lavori" })).toBeVisible();
    await page.getByRole("button", { name: "Pianificazione team" }).click();
    await page.getByRole("button", { name: "Mappa", exact: true }).click();
    await expect(page.getByText("2 in elenco · 2 sulla mappa")).toBeVisible();
    await page.getByRole("article").getByRole("button", { name: /DEM-01/ }).click();
    await expect(page.getByText(/Alba Bianchi · Presenza registrata/)).toBeVisible();
    await expect(page.getByText(/Alba Bianchi · Uscita registrata/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Apri commessa" })).toHaveAttribute("href", "/azienda/ordini/a");
    await page.getByRole("article").getByRole("button", { name: /DEM-02/ }).click();
    await expect(page.getByText("Bruno Monti", { exact: false }).filter({ hasText: "Assegnato" })).toBeVisible();
    await expect(page.getByText(/32,4 km · viaggi partiti/)).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, `mappa-lavori-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
    await page.getByRole("article").filter({ hasText: "DEM-02" }).getByRole("button", { name: "Chi è più vicino?" }).click();
    await page.getByRole("button", { name: "Valuta candidati" }).click();
    await page.getByRole("button", { name: "Rivedi assegnazione" }).click();
    await expect(page).toHaveURL(/\/azienda\/ordini\/b\?tab=cantiere&vista_cantiere=lavorazioni$/);
    assert.deepEqual(await page.evaluate(() => {
      const proposta = history.state.usr.propostaMappa;
      return { id: proposta.id, tipo: proposta.tipo, orderId: proposta.orderId };
    }), { id: "ta", tipo: "squadre", orderId: "b" });
    const lavori = await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione));

    await page.goto(`${base}/campo/calendario`, { waitUntil: "networkidle", timeout: 120000 });
    await expect(page.getByRole("heading", { name: "I miei lavori" })).toBeVisible();
    await page.getByRole("button", { name: "Mappa", exact: true }).click();
    await expect(page.getByText("2 in elenco · 2 sulla mappa")).toBeVisible();
    await page.getByRole("article").getByRole("button", { name: /Posa serramenti/ }).click();
    await expect(page.getByText("Assegnato a te")).toBeVisible();
    await expect(page.getByText(/Alba Bianchi · Presenza registrata/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Apri commessa" })).toHaveAttribute("href", /^\/campo\/lavoro\/a/);
    await page.screenshot({ path: path.join(output, `mappa-campo-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
    await page.getByRole("button", { name: /Da sistemare/ }).click();
    await expect(page.getByRole("link", { name: "Apri viaggio" })).toHaveAttribute("href", /\/campo\/mezzi\?mezzo=mezzo1&rivedi=viaggio2&giorno=/);
    const campo = await page.evaluate(() => window.mappaFixture.calls.map(c => c.azione));

    await page.goto(`${base}/azienda/calendario?scenario=ritorno`, { waitUntil: "networkidle", timeout: 120000 });
    await page.getByRole("button", { name: "Pianificazione team" }).click();
    await page.getByRole("button", { name: "Mappa", exact: true }).click();
    await expect(page.getByText("2 in elenco · 2 sulla mappa")).toBeVisible();
    await page.getByRole("button", { name: "Percorso", exact: true }).click();
    const itinerario = page.getByRole("region", { name: "Percorso pianificato" });
    await expect(itinerario.getByRole("article")).toHaveCount(3);
    await expect(itinerario.getByRole("article").nth(0)).toContainText("DEM-01");
    await expect(itinerario.getByRole("article").nth(1)).toContainText("DEM-02");
    await expect(itinerario.getByRole("article").nth(2)).toContainText("DEM-01");
    await expect(itinerario.getByRole("article").nth(2)).toContainText("14:00–16:00");
    await itinerario.getByRole("article").nth(2).getByRole("button", { name: /DEM-01/ }).click();
    await expect(itinerario.getByRole("article").nth(0).getByRole("button", { name: /DEM-01/ })).toHaveAttribute("aria-expanded", "false");
    await expect(itinerario.getByRole("article").nth(2).getByRole("button", { name: /DEM-01/ })).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "Calcola percorso" }).click();
    await expect(itinerario.getByText("Totale stimato · 9,5 km · 16 min")).toBeVisible();
    await mappa.scrollIntoViewIfNeeded();
    await expect(mappa.getByTitle("Tappe 1 e 3")).toBeInViewport();
    await expect(mappa.getByTitle(/DEM-02/)).toBeInViewport();
    await expect(mappa.locator(".leaflet-overlay-pane path").first()).toBeVisible();
    await page.screenshot({ path: path.join(output, `mappa-ritorno-${viewport.width}.png`), fullPage: true, timeout: 60_000 });
    await mappa.getByTitle("Tappe 1 e 3").click();
    await mappa.getByRole("button", { name: /^1\. DEM-01/ }).click();
    await expect(itinerario.getByRole("article").nth(0).getByRole("button", { name: /DEM-01/ })).toHaveAttribute("aria-expanded", "true");
    await expect(itinerario.getByRole("article").nth(2).getByRole("button", { name: /DEM-01/ })).toHaveAttribute("aria-expanded", "false");
    assert.deepEqual(errors, []);
    const nuoveViste = await verificaPartenze(page, viewport);
    assert.deepEqual(errors, []);
    const correzioni = await verificaCorrezioni(page, viewport);
    assert.deepEqual(errors, []);
    esiti.push({ viewport, vendite, lavori, campo, nuoveViste, correzioni, tileDiTest: requests.length, erroriPagina: errors });
    await context.close();
  }
  await writeFile(path.join(output, "browser.json"), JSON.stringify(esiti, null, 2));
  console.log(JSON.stringify(esiti));
} finally {
  await browser?.close();
  await server?.close();
}
