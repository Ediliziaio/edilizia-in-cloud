import { chromium } from "@playwright/test";
import { PDFDocument, degrees } from "pdf-lib";

/** Native print of the original document. No template, CSS or contents are replaced. */
export async function renderOriginalHtml(html, { assetBaseUrl, allowedOrigins, schede = [] }) {
  if (!Array.isArray(schede) || schede.length > 20 || schede.some(url => typeof url !== "string")) throw new Error("Elenco schede non valido");
  const browser = await chromium.launch({ headless: true });
  const deadline = setTimeout(() => { void browser.close(); }, 40_000);
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: "block" });
    const page = await context.newPage();
    const documentUrl = new URL("/__preventivo_pdf__", assetBaseUrl).href;
    const failures = [];
    await context.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.isNavigationRequest() && request.url() === documentUrl) {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      }
      const asset = ["image", "stylesheet", "font"].includes(request.resourceType());
      if (!asset || !["http:", "https:"].includes(url.protocol) || !allowedOrigins.includes(url.origin)) {
        failures.push("Risorsa non autorizzata");
        return route.abort();
      }
      return route.continue();
    });
    page.on("requestfailed", () => failures.push("Risorsa non caricata"));
    page.on("response", res => { if (res.status() >= 400) failures.push("Risorsa non disponibile"); });
    await page.emulateMedia({ media: "print" });
    await page.goto(documentUrl, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const layout = await page.evaluate(() => ({
      pages: document.querySelectorAll(".page").length,
      broken: [...document.images].some(img => img.src && (!img.complete || !img.naturalWidth)),
      // Match the app's insertion point without changing any original page.
      allegatiPrimaDi: (() => {
        const pages = [...document.querySelectorAll(".page")];
        for (const anchor of ["Condizioni generali di contratto", "Per accettazione", "Modulo di recesso", "Diritto di recesso"]) {
          const i = pages.findIndex(p => p.textContent.includes(anchor));
          if (i !== -1) return i;
        }
        return pages.length;
      })(),
    }));
    if (failures.length || layout.broken) throw new Error("Immagini o caratteri del preventivo non disponibili. Riprova la generazione.");
    const bytes = await page.pdf({ printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
    const pdf = await PDFDocument.load(bytes);
    if (!layout.pages || pdf.getPageCount() !== layout.pages) throw new Error("Il numero di pagine del PDF non coincide con il preventivo.");
    if (schede.length) {
      let position = layout.allegatiPrimaDi;
      let totalBytes = bytes.length;
      for (const href of [...new Set(schede)]) {
        const url = new URL(href, assetBaseUrl);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !allowedOrigins.includes(url.origin)) throw new Error("Origine scheda non autorizzata");
        const response = await context.request.get(url.href, { timeout: 15_000, maxRedirects: 0 });
        if (!response.ok() || Number(response.headers()["content-length"]) > 25 * 1024 * 1024) throw new Error("Scheda tecnica non disponibile");
        const data = await response.body();
        totalBytes += data.length;
        if (totalBytes > 25 * 1024 * 1024) throw new Error("Allegati troppo grandi");
        const source = await PDFDocument.load(data);
        if (!source.getPageCount() || pdf.getPageCount() + source.getPageCount() > 150) throw new Error("Scheda tecnica non valida");
        // Full A4, contained and centred: same framing as the app's print sheets.
        for (const sourcePage of source.getPages()) {
          const crop = sourcePage.getCropBox();
          const sheet = await pdf.embedPage(sourcePage, { left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height });
          const target = pdf.insertPage(position++, [595.28, 841.89]);
          const rotation = ((360 - sourcePage.getRotation().angle) % 360 + 360) % 360;
          const sideways = rotation === 90 || rotation === 270;
          const scale = Math.min(target.getWidth() / (sideways ? sheet.height : sheet.width), target.getHeight() / (sideways ? sheet.width : sheet.height));
          const width = sheet.width * scale, height = sheet.height * scale;
          const visibleWidth = sideways ? height : width, visibleHeight = sideways ? width : height;
          const x = (target.getWidth() - visibleWidth) / 2 + (rotation === 90 || rotation === 180 ? visibleWidth : 0);
          const y = (target.getHeight() - visibleHeight) / 2 + (rotation === 180 || rotation === 270 ? visibleHeight : 0);
          target.drawPage(sheet, { x, y, width, height, rotate: degrees(rotation) });
        }
      }
      return Buffer.from(await pdf.save());
    }
    return bytes;
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
