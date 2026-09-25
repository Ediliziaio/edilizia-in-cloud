/** Offline QA uses the actual preview enrichment, totals, images and production PDF. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer } from "@react-pdf/renderer";
import type { RstTemplatePdf } from "../src/types/ristrutturazione";
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { throw new Error("Network forbidden in PDF QA"); } }) }));
mock.module("@/hooks/useRistrutturazioneProgetto", () => ({ getRstTemplatePdf: () => { throw new Error("Template must be passed explicitly in QA"); } }));
mock.module("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async () => [] }));
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote image forbidden: ${url}`);
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
} }));
const { createFullRstTemplate, isFullRstModuleId } = await import("../src/lib/moduli-vendita/fullRstModules");
const { buildRstModulePreview } = await import("../src/lib/moduli-vendita/fullRstModules");
const { enrichRistrutturazionePdf } = await import("../src/hooks/useRistrutturazionePDF");
const { RistrutturazionePDF } = await import("../src/components/ristrutturazione/RistrutturazionePDF");
const output = path.resolve(process.argv[2] || "../full-module-qa");
await mkdir(output, { recursive: true });
const moduleId = process.argv[3] || "completa";
if (!isFullRstModuleId(moduleId)) throw new Error("Unknown Ristrutturazioni module");
const module = { id: moduleId };
const template = createFullRstTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22,
  condizioni_legali_attivo: false, payment_terms_text: "Modalità e scadenze da concordare prima della conferma.",
  validity_text: "Esempio dimostrativo, non utilizzabile come offerta.",
} as RstTemplatePdf, module.id);
for (const variant of ["base", "sconto-100", "prezzo-manuale", "molte-voci"] as const) {
  const data = buildRstModulePreview("qa-company", template, module.id);
  if (variant === "sconto-100") data.progetto.sconto_pct = 100;
  if (variant === "prezzo-manuale") Object.assign(data.progetto, { prezzo_manuale: 1000, sconto_pct: 10 });
  if (variant === "molte-voci") data.computo = Array.from({ length: 40 }, (_, i) => ({ ...data.computo[i % 4], id: `long-${i}`, ordine: i, descrizione: `${data.computo[i % 4].descrizione} · Zona ${i + 1}. ${"Quantità e materiali da confermare dopo il rilievo delle aree accessibili. ".repeat(3)}` }));
  const enriched = await enrichRistrutturazionePdf({ ...data, company: { name: "Impresa esempio", email: "info@example.invalid" } });
  const filename = path.join(output, `ristrutturazioni-${module.id}-${variant}.pdf`);
  await writeFile(filename, await renderToBuffer(<RistrutturazionePDF {...enriched} />));
  const extracted = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
  const text = extracted.replace(/\s+/g, " ");
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
