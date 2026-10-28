// Consuma solo gli HTML di prova esportati dai test. Nessun backend o invio reale.
import { chromium } from "@playwright/test";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const folder = process.argv[2];
if (!folder || !path.isAbsolute(folder)) throw new Error("Indica una cartella assoluta di artefatti QA locali.");
const origin = "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const filename of (await readdir(folder)).filter(f => /^fv-.*\.html$/.test(f)).sort()) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/__qa_pdf__" && url.origin === origin) return route.fulfill({ contentType: "text/html", body: "<!doctype html><html></html>" });
      if (url.origin === origin || ["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) return route.continue();
      return route.abort();
    });
    await page.goto(`${origin}/__qa_pdf__`);
    const html = await readFile(path.join(folder, filename), "utf8");
    await page.setContent(html, { waitUntil: "networkidle", timeout: 45_000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const content = await page.evaluate(() => ({
      pages: document.querySelectorAll(".page").length,
      broken: [...document.images].filter(img => img.src && (!img.complete || !img.naturalWidth)).map(img => img.src),
      text: document.body.innerText,
    }));
    if (errors.length || content.broken.length) throw new Error(`${filename}: ${JSON.stringify({ errors, broken: content.broken })}`);
    if (!content.text.includes(filename.includes("-copia") ? "CopiaQA" : "ClienteQA")) throw new Error(`Cliente mancante: ${filename}`);
    const pdfPath = path.join(folder, filename.replace(/\.html$/, ".pdf"));
    await page.pdf({ path: pdfPath, printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
    const pdf = await PDFDocument.load(await readFile(pdfPath));
    if (pdf.getPageCount() !== content.pages) throw new Error(`Pagine mancanti o vuote: ${filename}: ${content.pages} HTML, ${pdf.getPageCount()} PDF`);
    report.push({ filename, htmlPages: content.pages, pdfPages: pdf.getPageCount(), errors, brokenImages: content.broken });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(path.join(folder, "verifica-browser.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
