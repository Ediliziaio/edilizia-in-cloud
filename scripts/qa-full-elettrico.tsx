/** Offline QA uses the actual preview enrichment, totals, images and production PDF. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer } from "@react-pdf/renderer";
import type { EleTemplatePdf } from "../src/types/elettrico";
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { throw new Error("Network forbidden in PDF QA"); } }) }));
mock.module("@/hooks/useElettricoProgetto", () => ({ getEleTemplatePdf: () => { throw new Error("Template must be passed explicitly in QA"); } }));
mock.module("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async () => [] }));
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
} }));
const { createFullEltTemplate, isFullEltModuleId, FULL_ELT_MODULES } = await import("../src/lib/moduli-vendita/fullEltModules");
const { buildEltModulePreview } = await import("../src/lib/moduli-vendita/fullEltModules");
const { enrichElettricoPdf } = await import("../src/hooks/useElettricoPDF");
const { ElettricoPDF } = await import("../src/components/elettrico/ElettricoPDF");
const output = path.resolve(process.argv[2] || "../full-elettrico-qa");
await mkdir(output, { recursive: true });
const moduleIds = process.argv[3] ? [process.argv[3]] : FULL_ELT_MODULES;
for (const moduleId of moduleIds) {
if (!isFullEltModuleId(moduleId)) throw new Error("Unknown Elettrico module");
const module = { id: moduleId };
const template = createFullEltTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#263648", color_accent: "#a87137", default_iva_pct: 22,
  condizioni_legali_attivo: false, payment_terms_text: "Modalità e scadenze da concordare prima della conferma.",
  validity_text: "Esempio dimostrativo, non utilizzabile come offerta.",
} as EleTemplatePdf, module.id);
for (const variant of ["base", "sconto-100", "prezzo-manuale", "molte-voci"] as const) {
  const data = buildEltModulePreview("qa-company", template, module.id);
  if (variant === "sconto-100") data.progetto.sconto_pct = 100;
  if (variant === "prezzo-manuale") Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
  if (variant === "molte-voci") data.computo = Array.from({ length: 40 }, (_, i) => ({ ...data.computo[i % data.computo.length], id: `long-${i}`, ordine: i, descrizione: `${data.computo[i % data.computo.length].descrizione} · Zona ${i + 1}. ${"Quantità e materiali da confermare dopo il rilievo delle aree accessibili. ".repeat(3)}` }));
  const enriched = await enrichElettricoPdf({ ...data, company: { name: "Impresa esempio", email: "info@example.invalid" } });
  const filename = path.join(output, `elettrico-${module.id}-${variant}.pdf`);
  await writeFile(filename, await renderToBuffer(<ElettricoPDF {...enriched} />));
  const extracted = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
  const text = extracted.replace(/\s+/g, " ");
  if (/\b(?:NaN|Infinity|undefined)\b/.test(text)) throw new Error("Invalid value printed in PDF");
  if (!text.includes("NON COMPRESO")) throw new Error("Exclusions missing from PDF");
  if (!text.includes("FIRMA DEL CLIENTE")) throw new Error("Signature missing from PDF");
  // These native fixtures have eight short FAQs: the final renderer should
  // keep their heading and all answers together rather than split them 4+4.
  const faqPages = extracted.split("\f").map(page => page.replace(/\s+/g, " "));
  const faqPageIndices = template.faq.map(faq => faqPages.findIndex(page => page.includes(faq.domanda.replace(/\s+/g, " ").trim())));
  if (faqPageIndices.includes(-1) || new Set(faqPageIndices).size !== 1) throw new Error("Short FAQ missing or split across pages");
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
    const lastPrintedRow = enriched.capitoli.at(-1)!.voci.at(-1)!;
    const totalPage = pages.find(page => page.replace(/\s/g, "").includes("TOTALELAVORAZIONI"));
    if (!totalPage?.includes(lastPrintedRow.descrizione.replace(/\s+/g, " ").trim())) {
      throw new Error("Work total orphaned from the last printed work row");
    }
  }
  if (variant === "prezzo-manuale" && !text.includes("1.098,00")) throw new Error("Manual price not printed");
  if (variant === "sconto-100" && enriched.totali.totale !== 0) throw new Error("100% discount must yield zero");
  if (variant === "prezzo-manuale" && enriched.totali.totale !== 1098) throw new Error("Manual price calculation mismatch");
  console.log(module.id, variant, "totale", enriched.totali.totale);
}
}
