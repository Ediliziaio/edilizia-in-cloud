/** Offline QA uses the actual preview enrichment, totals, images and production PDF. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ClmTemplatePdf } from "../src/types/climatizzazione";
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { throw new Error("Network forbidden in PDF QA"); } }) }));
mock.module("@/hooks/useClimatizzazioneProgetto", () => ({ getClmTemplatePdf: () => { throw new Error("Template must be passed explicitly in QA"); } }));
mock.module("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async () => [] }));
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
} }));
const { createFullClmTemplate, isFullClmModuleId, FULL_CLM_MODULES } = await import("../src/lib/moduli-vendita/fullClmModules");
const { buildClmModulePreview } = await import("../src/lib/moduli-vendita/fullClmModules");
const { enrichClimatizzazionePdf } = await import("../src/hooks/useClimatizzazionePDF");
const { ClimatizzazionePDF } = await import("../src/components/climatizzazione/ClimatizzazionePDF");
const output = path.resolve(process.argv[2] || "../full-module-qa");
await mkdir(output, { recursive: true });
// With no module argument, exercise every native variant.
for (const moduleId of process.argv[3] ? [process.argv[3]] : FULL_CLM_MODULES) {
if (!isFullClmModuleId(moduleId)) throw new Error("Unknown Climatizzazione module");
const module = { id: moduleId };
const template = createFullClmTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22,
  condizioni_legali_attivo: false, payment_terms_text: "Modalità e scadenze da concordare prima della conferma.",
  validity_text: "Esempio dimostrativo, non utilizzabile come offerta.",
} as ClmTemplatePdf, module.id);
for (const variant of ["base", "sconto-100", "prezzo-manuale", "molte-voci"] as const) {
  const data = buildClmModulePreview("qa-company", template, module.id);
  if (variant === "sconto-100") data.progetto.sconto_pct = 100;
  if (variant === "prezzo-manuale") Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
  if (variant === "molte-voci") data.computo = Array.from({ length: 40 }, (_, i) => ({ ...data.computo[i % data.computo.length], id: `long-${i}`, ordine: i, descrizione: `${data.computo[i % data.computo.length].descrizione} · Zona ${i + 1}. ${"Quantità e materiali da confermare dopo il rilievo delle aree accessibili. ".repeat(3)}` }));
  const enriched = await enrichClimatizzazionePdf({ ...data, company: { name: "Impresa esempio", email: "info@example.invalid" } });
  const prepared = enriched.template as ClmTemplatePdf & {
    pdf_cover_image_url?: string;
    pdf_blocchi_foto: Record<string, Array<{ src: string }>>;
    pdf_pagine_foto: Record<string, string>;
  };
  if (!prepared.pdf_cover_image_url?.startsWith("data:image/")) throw new Error("Cover photo missing");
  for (const key of ["comeFunziona", "protezione", "controlli", "documenti", "diario"]) {
    if (!prepared.pdf_blocchi_foto[key]?.[0]?.src.startsWith("data:image/")) throw new Error(`Photo missing from ${key}`);
  }
  if (!prepared.pdf_pagine_foto.chiusura?.startsWith("data:image/")) throw new Error("Closing photo missing");
  if (prepared.pdf_pagine_foto.investimento || prepared.pdf_pagine_foto.domande) throw new Error("Economics and FAQ must remain text-only");
  const filename = path.join(output, `climatizzazione-${module.id}-${variant}.pdf`);
  await writeFile(filename, await renderToBuffer(<ClimatizzazionePDF {...enriched} />));
  const extracted = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
  const text = extracted.replace(/\s+/g, " ");
  // Check actual PDF image objects on the requested pages: inlining alone does
  // not prove the renderer displayed a photo (closing images are deduplicated).
  const imagePages = new Set(execFileSync("pdfimages", ["-list", filename], { encoding: "utf8" })
    .split("\n").map(line => line.trim().split(/\s+/))
    .filter(parts => parts[2] === "image" && Number(parts[3]) >= 600 && Number(parts[4]) >= 500)
    .map(parts => Number(parts[0])));
  const renderedPages = extracted.split("\f").map(page => page.replace(/\s+/g, " "));
  // These native modules have eight short FAQs: keep the heading and all
  // answers together. This is not a constraint on user-authored long FAQs.
  const faqPage = renderedPages.find(page => page.includes("Le domande che ci fanno"));
  if (!faqPage || template.faq?.length !== 8 || template.faq.some(faq =>
    ![faq.domanda, faq.risposta].every(value => faqPage.includes(value.replace(/\s+/g, " ").trim()))
  )) throw new Error("Short module FAQs split across pages or missing from PDF");
  for (const heading of ["Scelta per te", "Organizzare i lavori", "Funzione per funzione", "Da conservare", "Rese riconoscibili", "Pronti a partire"]) {
    if (!renderedPages.some((page, i) => page.includes(heading) && imagePages.has(i + 1))) {
      throw new Error(`No actual photo on PDF page: ${heading}`);
    }
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
    const lastRow = enriched.capitoli.at(-1)!.voci.at(-1)!;
    const totalPages = renderedPages.filter(page => page.replace(/\s/g, "").includes("TOTALELAVORAZIONI"));
    if (totalPages.length !== 1 || !totalPages[0].includes(lastRow.descrizione.replace(/\s+/g, " ").trim())) {
      throw new Error("Work total orphaned from the final work row");
    }
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
  console.log(module.id, variant, "totale", enriched.totali.totale);
}
}
