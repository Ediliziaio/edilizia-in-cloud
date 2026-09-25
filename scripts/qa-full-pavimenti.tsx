/** Offline QA uses the actual preview enrichment, totals, images and production PDF. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PavTemplatePdf } from "../src/types/pavimenti";
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { throw new Error("Network forbidden in PDF QA"); } }) }));
mock.module("@/hooks/usePavimentiProgetto", () => ({ getPavTemplatePdf: () => { throw new Error("Template must be passed explicitly in QA"); } }));
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).startsWith("data:")) return originalFetch(input, init); // Yoga's embedded WASM
  throw new Error(`Network forbidden in local PDF QA: ${String(input)}`);
}) as typeof fetch;
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
} }));
const { createFullPavTemplate, isFullPavModuleId } = await import("../src/lib/moduli-vendita/fullPavModules");
const { buildPavModulePreview } = await import("../src/lib/moduli-vendita/fullPavModules");
const { enrichPavimentiPdf } = await import("../src/hooks/usePavimentiPDF");
const { PavimentiPDF } = await import("../src/components/pavimenti/PavimentiPDF");
const { PAV_OPERATIONAL_IMAGES } = await import("../src/lib/moduli-vendita/pavEditorialContent");
const output = path.resolve(process.argv[2] || "../full-pavimenti-qa");
await mkdir(output, { recursive: true });
const moduleId = process.argv[3] || "sovrapposizione";
if (!isFullPavModuleId(moduleId)) throw new Error("Unknown Pavimenti module");
const module = { id: moduleId };
const template = createFullPavTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22,
  condizioni_legali_attivo: false, payment_terms_text: "Modalità e scadenze da concordare prima della conferma.",
  validity_text: "Esempio dimostrativo, non utilizzabile come offerta.",
} as PavTemplatePdf, module.id);
for (const variant of ["base", "sconto-100", "prezzo-manuale", "molte-voci"] as const) {
  const data = buildPavModulePreview("qa-company", template, module.id);
  if (variant === "sconto-100") data.progetto.sconto_pct = 100;
  if (variant === "prezzo-manuale") Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
  if (variant === "molte-voci") data.computo = Array.from({ length: 40 }, (_, i) => ({ ...data.computo[i % data.computo.length], id: `long-${i}`, ordine: i, descrizione: `${data.computo[i % data.computo.length].descrizione} · Zona ${i + 1}. ${"Quantità e materiali da confermare dopo il rilievo delle aree accessibili. ".repeat(3)}` }));
  const enriched = await enrichPavimentiPdf(data);
  const operational = PAV_OPERATIONAL_IMAGES[module.id as keyof typeof PAV_OPERATIONAL_IMAGES];
  if (operational) {
    const expected = `data:image/jpeg;base64,${(await readFile(path.resolve("public", operational.slice(1)))).toString("base64")}`;
    const photos = (enriched.template as unknown as { pdf_blocchi_foto: Record<string, { src: string }[]> }).pdf_blocchi_foto;
    for (const key of ["comeFunziona", "diario", ...(module.id === "esterni" ? ["controlli"] : [])]) {
      if (photos[key]?.[0]?.src !== expected) throw new Error(`Operational image not inlined for ${module.id}/${key}`);
    }
  }
  const filename = path.join(output, `pavimenti-${module.id}-${variant}.pdf`);
  const rendered = await renderToBuffer(<PavimentiPDF {...enriched} />);
  // The native renderer embeds JPEG streams unchanged. Check the new operation
  // is actually inside the PDF, not merely listed in the editor's image library.
  if (operational && !rendered.includes(await readFile(path.resolve("public", operational.slice(1))))) {
    throw new Error(`Operational JPEG not embedded in native PDF: ${module.id}/${variant}`);
  }
  await writeFile(filename, rendered);
  const extracted = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
  const text = extracted.replace(/\s+/g, " ");
  if (operational && !text.includes("generata con AI")) throw new Error("Generated illustration disclosure missing");
  if (/\b(?:NaN|Infinity|undefined)\b/.test(text)) throw new Error("Invalid value printed in PDF");
  for (const title of ["PROTEGGERE CIÒ CHE RESTA", "DA VERIFICARE INSIEME", "DA CONSERVARE"]) {
    if (!text.toLocaleUpperCase("it").includes(title)) throw new Error(`Missing editorial block: ${title}`);
  }
  if (!text.includes("NON COMPRESO")) throw new Error("Exclusions missing from PDF");
  if (!text.includes("FIRMA DEL CLIENTE")) throw new Error("Signature missing from PDF");
  const faqPages = extracted.split("\f").map(page => page.replace(/\s+/g, " "));
  const faq = template.faq ?? [];
  if (faq.length !== 8 || !faqPages.some(page => faq.every(item =>
    page.includes(item.domanda.replace(/\s+/g, " ").trim()) &&
    page.includes(item.risposta.replace(/\s+/g, " ").trim())
  ))) throw new Error(`Eight short FAQs must stay together: ${module.id}/${variant}`);
  // The final work row must accompany the net works total, never leave it
  // alone on an otherwise empty continuation page (native renderer regression).
  const totalPages = extracted.split("\f").filter(page => page.replace(/\s/g, "").includes("TOTALELAVORAZIONI"));
  const lastWork = data.computo[data.computo.length - 1].descrizione.replace(/\s+/g, " ").trim();
  if (totalPages.length !== 1 || !totalPages[0].replace(/\s+/g, " ").includes(lastWork)) {
    throw new Error(`Works total separated from final row: ${module.id}/${variant}`);
  }
  if (variant === "molte-voci") for (let i = 1; i <= 40; i++) {
    if (!text.includes(`Zona ${i}.`)) throw new Error(`Work row ${i} missing from PDF`);
  }
  // Regression: a chapter heading and its column labels must not be orphaned
  // on the preceding page when the first work description is unusually long.
  if (variant === "molte-voci") {
    const pages = extracted.split("\f").map(page => page.replace(/\s+/g, " "));
    const chapters = [...new Set(data.computo.map(row => row.capitolo_nome))];
    chapters.forEach((name, i) => {
      const heading = `${String(i + 1).padStart(2, "0")} ${name}`;
      const firstRow = data.computo.find(row => row.capitolo_nome === name)!;
      const chapterPages = pages.filter(page => page.includes(heading) && page.replace(/\s/g, "").includes("LAVORAZIONE"));
      if (chapterPages.length !== 1 || !chapterPages[0].includes(firstRow.descrizione.replace(/\s+/g, " ").trim())) {
        throw new Error(`Chapter heading separated from first work row: ${name}`);
      }
    });
  }
  if (variant === "prezzo-manuale" && !text.includes("1.098,00")) throw new Error("Manual price not printed");
  if (variant === "sconto-100" && enriched.totali.totale !== 0) throw new Error("100% discount must yield zero");
  if (variant === "prezzo-manuale" && enriched.totali.totale !== 1098) throw new Error("Manual price calculation mismatch");
  console.log(variant, "totale", enriched.totali.totale);
}
