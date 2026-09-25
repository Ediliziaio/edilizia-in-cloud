/** Offline QA uses the actual preview enrichment, totals, images and production PDF. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer } from "@react-pdf/renderer";
import type { BgnTemplatePdf } from "../src/types/bagni";
import { withEdilePageVisibility } from "../src/components/preventivi/edilePageVisibility";
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { throw new Error("Network forbidden in PDF QA"); } }) }));
mock.module("@/hooks/useBagniProgetto", () => ({ getBgnTemplatePdf: () => { throw new Error("Template must be passed explicitly in QA"); } }));
mock.module("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async () => [] }));
const originalFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  if (String(input).startsWith("data:")) return originalFetch(input, init); // Embedded Yoga WASM only.
  throw new Error(`Network forbidden in PDF QA: ${String(input)}`);
}) as typeof fetch;
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
} }));
const { createFullBgnTemplate, isFullBgnModuleId } = await import("../src/lib/moduli-vendita/fullBgnModules");
const { buildBgnModulePreview } = await import("../src/lib/moduli-vendita/fullBgnModules");
const { enrichBagniPdf } = await import("../src/hooks/useBagniPDF");
const { BagniPDF } = await import("../src/components/bagni/BagniPDF");
const { BGN_CHECK_IMAGES, BGN_GENERATED_CHECK_IMAGES } = await import("../src/lib/moduli-vendita/bgnEditorialPhotography");
const output = path.resolve(process.argv[2] || "../full-module-qa");
await mkdir(output, { recursive: true });
const moduleId = process.argv[3] || "completo";
if (!isFullBgnModuleId(moduleId)) throw new Error("Unknown Bagni module");
const module = { id: moduleId };
const template = createFullBgnTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22,
  condizioni_legali_attivo: false, payment_terms_text: "Modalità e scadenze da concordare prima della conferma.",
  validity_text: "Esempio dimostrativo, non utilizzabile come offerta.",
} as BgnTemplatePdf, module.id);
const longFaq = process.argv.includes("--long-faq");
const visibilityQa = process.argv.includes("--visibility");
if (longFaq) template.faq = template.faq.map(item => ({ ...item, risposta: Array(5).fill(item.risposta).join(" ") }));
const variants = visibilityQa ? ["visibilita-attiva", "visibilita-spenta", "visibilita-riattivata", "visibilita-solo-usp"] : longFaq ? ["faq-lunghe"] : ["base", "sconto-100", "prezzo-manuale", "molte-voci"];
for (const variant of variants) {
  let variantTemplate = structuredClone(template);
  if (visibilityQa) {
    Object.assign(variantTemplate, { show_chi_siamo: true, show_percorso: true, show_cronoprogramma: true,
      chi_siamo: "PRESENTAZIONEQA", usp: [{ titolo: "DISTINTIVOQA", descrizione: "Valore verificabile" }],
      percorso: [{ titolo: "PERCORSOQA", descrizione: "Fase di prova" }],
      cronoprogramma: [{ fase: "TEMPIQA", durata: "1 giorno", descrizione: "Durata di prova" }],
    });
    for (const chapter of ["chiSiamo", "percorso", "tempi"]) variantTemplate = withEdilePageVisibility(variantTemplate, chapter, true);
    if (variant === "visibilita-spenta" || variant === "visibilita-riattivata") {
      for (const chapter of ["chiSiamo", "percorso", "tempi"]) variantTemplate = withEdilePageVisibility(variantTemplate, chapter, false);
    }
    if (variant === "visibilita-riattivata") {
      Object.assign(variantTemplate, { show_chi_siamo: false, show_percorso: false, show_cronoprogramma: false });
      for (const chapter of ["chiSiamo", "percorso", "tempi"]) variantTemplate = withEdilePageVisibility(variantTemplate, chapter, true);
    }
    if (variant === "visibilita-solo-usp") variantTemplate.show_chi_siamo = false;
  }
  const data = buildBgnModulePreview("qa-company", variantTemplate, module.id);
  if (variant === "sconto-100") data.progetto.sconto_pct = 100;
  if (variant === "prezzo-manuale") Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
  if (variant === "molte-voci") data.computo = Array.from({ length: 40 }, (_, i) => ({ ...data.computo[i % 4], id: `long-${i}`, ordine: i, descrizione: `${data.computo[i % 4].descrizione} · Zona ${i + 1}. ${"Quantità e materiali da confermare dopo il rilievo delle aree accessibili. ".repeat(3)}` }));
  const enriched = await enrichBagniPdf({ ...data, company: { name: "Impresa esempio", email: "info@example.invalid" } });
  const operational = BGN_CHECK_IMAGES[module.id];
  const jpeg = await readFile(path.resolve("public", operational.slice(1)));
  const expected = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  const photos = (enriched.template as unknown as { pdf_blocchi_foto: Record<string, { src: string }[]> }).pdf_blocchi_foto;
  for (const key of ["controlli", ...(module.id === "accessibilita" ? ["comeFunziona", "diario"] : [])]) {
    if (photos[key]?.[0]?.src !== expected) throw new Error(`Incorrect inlined image: ${module.id}/${key}`);
  }
  const filename = path.join(output, `bagni-${module.id}-${variant}.pdf`);
  const rendered = await renderToBuffer(<BagniPDF {...enriched} />);
  if (!rendered.includes(jpeg)) throw new Error(`Check image not embedded: ${module.id}/${variant}`);
  await writeFile(filename, rendered);
  const extracted = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
  const text = extracted.replace(/\s+/g, " ");
  if (visibilityQa) {
    for (const marker of ["PRESENTAZIONEQA", "DISTINTIVOQA", "PERCORSOQA", "TEMPIQA"]) {
      const expectedVisible = variant !== "visibilita-spenta" && !(variant === "visibilita-solo-usp" && marker === "PRESENTAZIONEQA");
      if (text.includes(marker) !== expectedVisible) throw new Error(`Visibility mismatch: ${variant}/${marker}`);
    }
  }
  if (BGN_GENERATED_CHECK_IMAGES.includes(operational) && !text.includes("generata con AI")) throw new Error("Generated image disclosure missing");
  const faqPages = extracted.split("\f").map(page => page.replace(/\s+/g, " "));
  const hasFaq = (page: string, item: typeof template.faq[number]) =>
    page.includes(item.domanda.replace(/\s+/g, " ").trim()) && page.includes(item.risposta.replace(/\s+/g, " ").trim());
  if (!longFaq && !faqPages.some(page => template.faq.every(item => hasFaq(page, item)))) {
    throw new Error(`Eight short FAQs must stay together: ${module.id}/${variant}`);
  }
  if (longFaq) {
    if (faqPages.some(page => template.faq.every(item => hasFaq(page, item)))) throw new Error("Long FAQs unexpectedly forced onto one page");
    for (const item of template.faq) if (!faqPages.some(page => hasFaq(page, item))) throw new Error(`Long answer lost or split: ${item.domanda}`);
  }
  if (/\b(?:NaN|Infinity|undefined)\b/.test(text)) throw new Error("Invalid value printed in PDF");
  if (!text.includes("NON COMPRESO")) throw new Error("Exclusions missing from PDF");
  if (!text.includes("FIRMA DEL CLIENTE")) throw new Error("Signature missing from PDF");
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
