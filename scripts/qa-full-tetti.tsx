/** Offline QA uses the actual preview enrichment, totals, images and production PDF. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer } from "@react-pdf/renderer";
import type { TetTemplatePdf } from "../src/types/tetti";
import { leggiBlocco, leggiFotoPagina } from "../supabase/functions/_shared/blocchiPreventivo";
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { throw new Error("Network forbidden in PDF QA"); } }) }));
mock.module("@/hooks/useTettiProgetto", () => ({ getTetTemplatePdf: () => { throw new Error("Template must be passed explicitly in QA"); } }));
mock.module("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async () => [] }));
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
} }));
const { createFullTettiTemplate } = await import("../src/lib/moduli-vendita/fullTettiModules");
const { buildTettiTemplatePreview, findTettiTemplateModule } = await import("../src/lib/moduli-vendita/tettiTemplateModules");
const { enrichTettiPdf } = await import("../src/hooks/useTettiPDF");
const { TettiPDF } = await import("../src/components/tetti/TettiPDF");
const output = path.resolve(process.argv[2] || "../full-module-qa");
await mkdir(output, { recursive: true });
const module = findTettiTemplateModule(process.argv[3] || "ripasso");
if (!module) throw new Error("Unknown Tetti module");
const template = createFullTettiTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22,
  condizioni_legali_attivo: false, payment_terms_text: "Modalità e scadenze da concordare prima della conferma.",
  validity_text: "Esempio dimostrativo, non utilizzabile come offerta.",
} as TetTemplatePdf, module.id);
const closing = leggiFotoPagina("chiusura", "tetti", template.pdf_blocchi);
const blockPhotos = (["comeFunziona", "compreso", "protezione", "controlli", "documenti", "diario"] as const)
  .flatMap(key => leggiBlocco(key, "tetti", template.pdf_blocchi).foto);
if (!closing || blockPhotos.includes(closing)) throw new Error("Closing image absent or suppressed by block duplication");
if (module.id === "impermeabilizzazione" && leggiBlocco("diario", "tetti", template.pdf_blocchi).foto[0] !== "/module-art/tetti-impermeabilizzazione-cover.jpg") {
  throw new Error("Waterproofing diary must show a flat-roof membrane, not pitched tiles");
}
if (module.id === "impermeabilizzazione" && leggiFotoPagina("tempi", "tetti", template.pdf_blocchi)) {
  throw new Error("Waterproofing timeline must not reintroduce the pitched-tile sector fallback");
}
for (const variant of ["base", "sconto-100", "prezzo-manuale", "molte-voci"] as const) {
  const data = buildTettiTemplatePreview("qa-company", template, module.id);
  if (variant === "sconto-100") data.progetto.sconto_pct = 100;
  if (variant === "prezzo-manuale") Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
  if (variant === "molte-voci") data.computo = Array.from({ length: 40 }, (_, i) => ({ ...data.computo[i % 4], id: `long-${i}`, ordine: i, descrizione: `${data.computo[i % 4].descrizione} · Zona ${i + 1}. ${"Quantità e materiali da confermare dopo il rilievo delle aree accessibili. ".repeat(3)}` }));
  const enriched = await enrichTettiPdf({ ...data, company: { name: "Impresa esempio", email: "info@example.invalid" } });
  const filename = path.join(output, `${module.id}-${variant}.pdf`);
  await writeFile(filename, await renderToBuffer(<TettiPDF {...enriched} />));
  const pageTexts = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" }).split("\f").map(page => page.replace(/\s+/g, " "));
  const text = pageTexts.join(" ");
  if (!pageTexts.some(page => template.faq?.every(faq => page.includes(faq.domanda.replace(/\s+/g, " "))))) throw new Error("Short FAQ must remain together on one page");
  execFileSync("python3", ["-c", "import pdfplumber,sys; p=pdfplumber.open(sys.argv[1]); assert p.pages[-1].images, 'Closing page has no rendered image'; p.close()", filename]);
  if (/\b(?:NaN|Infinity|undefined)\b/.test(text)) throw new Error("Invalid value printed in PDF");
  if (!text.includes("NON COMPRESO")) throw new Error("Exclusions missing from PDF");
  if (!text.includes("FIRMA DEL CLIENTE")) throw new Error("Signature missing from PDF");
  if (variant === "molte-voci") for (let i = 1; i <= 40; i++) {
    if (!text.includes(`Zona ${i}.`)) throw new Error(`Work row ${i} missing from PDF`);
  }
  if (variant === "prezzo-manuale" && !text.includes("1.098,00")) throw new Error("Manual price not printed");
  if (variant === "sconto-100" && enriched.totali.totale !== 0) throw new Error("100% discount must yield zero");
  if (variant === "prezzo-manuale" && enriched.totali.totale !== 1098) throw new Error("Manual price calculation mismatch");
  console.log(variant, "totale", enriched.totali.totale);
}
