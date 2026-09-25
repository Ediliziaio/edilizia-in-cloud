// Offline Chromium proof of our generated HTML only; never connects to the application/account.
import { chromium } from "playwright";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const directory = path.resolve(process.argv[2]);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.route(/^https?:/, route => route.abort());
for (const file of (await readdir(directory)).filter(f => f.endsWith(".html") && !f.endsWith("-screen.html"))) {
  await page.goto(pathToFileURL(path.join(directory, file)).href);
  await page.emulateMedia({ media: "print" });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  const problems = await page.evaluate(() => [...document.querySelectorAll(".page")].flatMap((p, i) => {
    const r = p.getBoundingClientRect();
    const content = p.querySelector(".content");
    const result = [];
    if (content && content.scrollHeight > content.clientHeight + 3) result.push(`page ${i + 1}: overflowing content ${content.scrollHeight}/${content.clientHeight}`);
    for (const img of p.querySelectorAll("img")) if (!img.complete || !img.naturalWidth) result.push(`page ${i + 1}: image missing`);
    for (const el of p.querySelectorAll("h1,h2,h3,p,.product-card,.faq-item,.tl-item")) {
      const b = el.getBoundingClientRect(); if (b.bottom > r.bottom - 10) result.push(`page ${i + 1}: content beyond bottom ${el.textContent.slice(0, 45)}`);
    }
    return result;
  }));
  await page.pdf({ path: path.join(directory, file.replace(/\.html$/, ".pdf")), format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log(file, problems.length ? JSON.stringify(problems) : "PASS images/content bounds");
  if (problems.length) process.exitCode = 1;
}
await browser.close();
