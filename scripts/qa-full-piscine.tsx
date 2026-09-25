/** Offline QA uses the actual preview enrichment, totals, images and production PDF. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer } from "@react-pdf/renderer";
import type { PisTemplatePdf } from "../src/types/piscine";
import type { FotoBloccoPronta } from "../src/lib/pdf/fotoBlocchi";
let networkAttempts = 0;
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { networkAttempts++; throw new Error("Network forbidden in PDF QA"); } }) }));
mock.module("@/hooks/usePiscineProgetto", () => ({ getPisTemplatePdf: () => { throw new Error("Template must be passed explicitly in QA"); } }));
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
} }));
const { createFullPscTemplate, isFullPscModuleId, PSC_MODULE_COVERS } = await import("../src/lib/moduli-vendita/fullPscModules");
const { buildPscModulePreview } = await import("../src/lib/moduli-vendita/fullPscModules");
const { enrichPiscinePdf } = await import("../src/hooks/usePiscinePDF");
const { PiscinePDF } = await import("../src/components/piscine/PiscinePDF");
const output = path.resolve(process.argv[2] || "../full-piscine-qa");
await mkdir(output, { recursive: true });
const { FULL_PSC_MODULES } = await import("../src/lib/moduli-vendita/fullPscModules");
for (const moduleId of process.argv[3] ? [process.argv[3]] : FULL_PSC_MODULES) {
if (!isFullPscModuleId(moduleId)) throw new Error("Unknown Piscine module");
const module = { id: moduleId };
const template = createFullPscTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22,
  condizioni_legali_attivo: false, payment_terms_text: "Modalità e scadenze da concordare prima della conferma.",
  validity_text: "Esempio dimostrativo, non utilizzabile come offerta.",
} as PisTemplatePdf, module.id);
for (const variant of ["base", "sconto-100", "prezzo-manuale", "molte-voci"] as const) {
  const data = buildPscModulePreview("qa-company", template, module.id);
  if (variant === "sconto-100") data.progetto.sconto_pct = 100;
  if (variant === "prezzo-manuale") Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
  if (variant === "molte-voci") data.computo = Array.from({ length: 40 }, (_, i) => ({ ...data.computo[i % data.computo.length], id: `long-${i}`, ordine: i, descrizione: `${data.computo[i % data.computo.length].descrizione} · Zona ${i + 1}. ${"Quantità e materiali da confermare dopo il rilievo delle aree accessibili. ".repeat(3)}` }));
  const enriched = await enrichPiscinePdf(data);
  if (networkAttempts) throw new Error(`Local enrichment attempted ${networkAttempts} remote operations`);
  const images = enriched.template as unknown as { pdf_blocchi_foto: Record<string, FotoBloccoPronta[]>; pdf_pagine_foto: Record<string, string> };
  for (const key of ["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"]) {
    if (!images.pdf_blocchi_foto[key]?.some(photo => photo.src.startsWith("data:image/"))) throw new Error(`Missing rendered block image: ${key}`);
  }
  if (!images.pdf_pagine_foto.chiusura?.startsWith("data:image/")) throw new Error("Missing closing photograph");
  if (module.id === "accessori" && images.pdf_blocchi_foto.documenti[0].src === images.pdf_blocchi_foto.diario[0].src) throw new Error("Accessory diary duplicates the documents photograph");
  if (Object.values(images.pdf_blocchi_foto).flat().some(photo => photo.src === images.pdf_pagine_foto.chiusura)) throw new Error("Native renderer would suppress the duplicate closing photograph");
  if (template.cover_image_url !== PSC_MODULE_COVERS[module.id]) throw new Error("Catalogue and native cover differ");
  // Verify actual enriched page images, not merely entries in the editor library.
  if (module.id === "accessori" || module.id === "rivestimento") {
    const asset = `/module-art/piscine-${module.id === "accessori" ? "copertura-rullo" : "posa-pvc"}.jpg`;
    const expected = `data:image/jpeg;base64,${(await readFile(path.resolve("public", asset.slice(1)))).toString("base64")}`;
    if (template.cover_image_url !== asset) throw new Error(`Wrong intervention cover: ${module.id}`);
    if (enriched.template.cover_image_url !== expected) throw new Error(`New cover missing from native PDF: ${module.id}`);
    for (const key of module.id === "accessori" ? ["comeFunziona", "controlli"] : ["comeFunziona"]) {
      if (!images.pdf_blocchi_foto[key]?.some(photo => photo.src === expected)) throw new Error(`New illustration missing from native page: ${module.id}/${key}`);
    }
    const uses = Object.values(images.pdf_blocchi_foto).flat().filter(photo => photo.src === expected).length;
    if (uses !== (module.id === "accessori" ? 2 : 1)) throw new Error(`Excessive illustration repetition: ${module.id}`);
  }
  const filename = path.join(output, `piscine-${module.id}-${variant}.pdf`);
  await writeFile(filename, await renderToBuffer(<PiscinePDF {...enriched} />));
  const extracted = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
  const text = extracted.replace(/\s+/g, " ");
  if (/\b(?:NaN|Infinity|undefined)\b/.test(text)) throw new Error("Invalid value printed in PDF");
  if (!text.includes("NON COMPRESO")) throw new Error("Exclusions missing from PDF");
  if (!text.includes("FIRMA DEL CLIENTE")) throw new Error("Signature missing from PDF");
  for (const item of template.faq) if (!text.includes(item.domanda)) throw new Error(`FAQ missing from PDF: ${item.domanda}`);
  // Built-in Piscine FAQs fit on one page: keep all eight questions together
  // after the timeline instead of producing a sparse 4+4 continuation.
  const faqPages = extracted.split("\f").map(page => page.replace(/\s+/g, " "));
  if (faqPages.filter(page => template.faq.every(item => page.includes(item.domanda))).length !== 1) throw new Error(`Short FAQ split across pages: ${module.id}/${variant}`);
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
  console.log(module.id, variant, "totale", enriched.totali.totale, "network", networkAttempts);
}

}
