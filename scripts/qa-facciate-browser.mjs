/** node scripts/qa-facciate-browser.mjs [output-directory]. Own isolated local Vite server. */
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import { chromium } from "@playwright/test";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
const output = path.resolve(process.argv[2] || "../facciate-native-qa/browser");
await mkdir(output, { recursive: true });
const server = await createServer({
  configFile: false, root: process.cwd(), logLevel: "error",
  // Shared native widgets import the client module; no client operation is permitted in this QA.
  define: { "import.meta.env.VITE_SUPABASE_URL": JSON.stringify("https://unused.invalid"), "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify("qa-local-no-service") },
  resolve: { alias: { "@": path.resolve("src") } },
  plugins: [react(), { name: "facciate-qa-only", configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.split("?")[0] !== "/facciate-qa") return next();
      server.transformIndexHtml("/facciate-qa", '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/facciate-browser-harness.tsx"></script></body></html>').then(html => { res.setHeader("Content-Type", "text/html"); res.end(html); });
    });
  } }],
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const url = `http://127.0.0.1:${server.httpServer.address().port}/facciate-qa`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const blocked = [], errors = [];
await page.route("**/*", route => {
  const request = route.request().url();
  if (/^(data|blob):/.test(request) || request.startsWith(new URL(url).origin + "/")) return route.continue();
  blocked.push(request); return route.abort("blockedbyclient");
});
page.on("pageerror", error => errors.push(error.message));
let accept = false, dialogs = 0;
page.on("dialog", async dialog => { dialogs++; if (accept) await dialog.accept(); else await dialog.dismiss(); });
try {
  await page.goto(`${url}?area=facciate`);
  await page.getByRole("link", { name: "Apri cappotto", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Titolo copertina", exact: true });
  await title.fill("Bozza browser\nNon perderla");
  const assertDraft = async stage => { const value = await title.inputValue(); if (value !== "Bozza browser\nNon perderla") throw new Error(`${stage}: lost draft ${JSON.stringify({ value, dialogs })}`); };
  await assertDraft("fill");
  await page.getByRole("button", { name: "← Moduli Facciate" }).click();
  if (!page.url().includes("modello=cappotto")) throw new Error("Back button lost unsaved work");
  await assertDraft("panel button");
  await page.getByRole("link", { name: "Sidebar elenco" }).click();
  if (!page.url().includes("modello=cappotto")) throw new Error("Sidebar lost unsaved work");
  await assertDraft("sidebar");
  await page.getByRole("link", { name: "Designer esterno" }).click();
  await assertDraft("designer");
  await page.evaluate(() => history.back());
  await page.waitForFunction(() => window.history.state?.idx === 1);
  await page.waitForFunction(() => location.search.includes("modello=cappotto"));
  await assertDraft("browser back");
  const unloading = page.waitForEvent("dialog", { predicate: dialog => dialog.type() === "beforeunload" });
  await page.evaluate(() => location.reload());
  await unloading;
  if (await title.inputValue() !== "Bozza browser\nNon perderla") throw new Error("Reload lost draft");
  await page.getByRole("button", { name: "Come funziona", exact: true }).click();
  if (dialogs !== 5) throw new Error(`Expected five leave confirmations, got ${dialogs}`);
  await page.getByRole("button", { name: "Salva modulo in locale" }).click();
  await page.getByText("Modulo salvato in locale.", { exact: true }).waitFor();
  await page.locator('canvas[data-page="1"]').waitFor({ timeout: 90000 });
  await page.waitForFunction(() => document.querySelector('canvas[data-page="1"]')?.width > 100);
  await page.screenshot({ path: path.join(output, "facciate-native-editor.png"), fullPage: true });
  await page.getByRole("button", { name: "← Moduli Facciate" }).click();
  await page.getByText("Elenco moduli", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Apri cappotto", exact: true }).click();
  if (await title.inputValue() !== "Bozza browser\nNon perderla") throw new Error("Saved draft did not reload");
  accept = true;
  await title.fill("Da scartare");
  await page.getByRole("link", { name: "Sidebar elenco" }).click();
  await page.getByText("Elenco moduli", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Apri cappotto", exact: true }).click();
  if (await title.inputValue() !== "Bozza browser\nNon perderla") throw new Error("Explicit discard retained an unsaved recovery draft");
  await page.getByRole("link", { name: "Apri balconi", exact: true }).click();
  await page.getByRole("heading", { name: "Balconi e frontalini", exact: true }).waitFor();
  await page.getByLabel("Carica immagine copertina", { exact: true }).setInputFiles(path.resolve("public/module-art/facciate-balconi-dettaglio.jpg"));
  await page.waitForFunction(() => document.querySelector('img[alt="Immagine copertina"]')?.getAttribute("src")?.startsWith("data:image/jpeg;base64,"));
  await page.getByRole("button", { name: "Salva modulo in locale" }).click();
  await page.getByText("Modulo salvato in locale.", { exact: true }).waitFor();
  const uploaded = await page.evaluate(() => JSON.parse(localStorage.getItem("eic:full-fac-module:v1:qa-browser:balconi")).template.pdf_cover_image_url);
  if (!uploaded.startsWith("data:image/jpeg;base64,")) throw new Error("Upload was not stored inline locally");
  if (blocked.length || errors.length) throw new Error(JSON.stringify({ blocked, errors }));
  await writeFile(path.join(output, "browser-report.json"), JSON.stringify({ passed: true, dialogs, externalRequests: blocked, pageErrors: errors }, null, 2));
  console.log("Facciate browser QA passed: native canvas PDF, save/reload, back/sidebar/designer/popstate/discard, real local image upload, no external requests");
} catch (error) {
  console.error(JSON.stringify({ url: page.url(), blocked, errors, body: await page.locator("body").innerText() }, null, 2));
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally { await browser.close(); await server.close(); }
