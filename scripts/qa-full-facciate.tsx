/** bun scripts/qa-full-facciate.tsx [output-directory] [one-module-id]
 * Real original DocumentoEdilePDF, native adapter and local raster conversion; no service mocks.
 */
import React from "react";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { renderToBuffer } from "@react-pdf/renderer";
import { FULL_FAC_MODULES, FAC_MODULE_TITLES, buildFacModulePreview, createFullFacTemplate, facPriceFixture, isFullFacModuleId } from "../src/lib/moduli-vendita/fullFacModules";
import { FacciatePDF, inlineFacPdfImages } from "../src/components/facciate/facPdfAdapter";

globalThis.fetch = async () => { throw new Error("Network forbidden in Facciate PDF QA"); };
const output = path.resolve(process.argv[2] || "../facciate-native-qa");
const selected = process.argv[3];
if (selected && !isFullFacModuleId(selected)) throw new Error("Unknown Facciate module");
const ids = selected ? [selected] : FULL_FAC_MODULES;
await mkdir(output, { recursive: true });
const report: Array<Record<string, unknown>> = [];
for (const id of ids) {
  const original = createFullFacTemplate({ company_id: "qa-company", ragione_sociale: "Impresa esempio", email: "info@example.invalid" }, id);
  for (const variant of ["base", "sconto-100", "prezzo-manuale", "molte-voci", "modificato"] as const) {
    const template = structuredClone(original);
    if (variant === "modificato") {
      template.cover_title = "Titolo modificato\nFacciate locali";
      template.faq[7].risposta = "RISPOSTA-OTTO-MODIFICATA. Quantità e condizioni da concordare.";
      template.pdf_ordine_capitoli = template.pdf_ordine_capitoli!.map(p => p.chiave === "protezione" ? { ...p, visibile: false } : p);
      template.pdf_pagine_libere = [{ id: "qa", titolo: "Pagina aggiunta", testoHtml: "<p>CONTENUTO-LIBERO-QA</p>", occhiello: "Nota locale", fotoUrl: null, didascalia: null }];
    }
    const rows = variant === "molte-voci" ? Array.from({ length: 40 }, (_, i) => ({ ...facPriceFixture(id)[i % 6], id: `long-${i}`, descrizione: `ZONA-${i + 1}. ${facPriceFixture(id)[i % 6].descrizione}. ${"Quantità e condizioni da verificare nel rilievo delle parti accessibili. ".repeat(3)}` })) : undefined;
    const raw = buildFacModulePreview("qa-company", template, id, { rows, discountPct: variant === "sconto-100" ? 100 : variant === "prezzo-manuale" ? 10 : 0, manualPrice: variant === "prezzo-manuale" ? 1000 : undefined });
    const dati = await inlineFacPdfImages(raw, async source => {
      const buffer = source.startsWith("data:") ? Buffer.from(source.split(",")[1], "base64") : await readFile(path.resolve("public", source.slice(1)));
      return `data:image/png;base64,${(await sharp(buffer).resize({ width: 1600, withoutEnlargement: true }).png().toBuffer()).toString("base64")}`;
    });
    const filename = path.join(output, `facciate-${id}-${variant}.pdf`);
    await writeFile(filename, await renderToBuffer(<FacciatePDF dati={dati} />));
    const extracted = execFileSync("pdftotext", [filename, "-"], { encoding: "utf8" });
    const text = extracted.replace(/\s+/g, " ");
    const compact = (value: string) => value.replace(/\s+/g, " ").trim();
    if (/\b(NaN|undefined|Infinity)\b/.test(text)) throw new Error(`Invalid text: ${filename}`);
    for (const expected of [FAC_MODULE_TITLES[id], "NON COMPRESO", "FIRMA DEL CLIENTE", "non un'offerta", "prezzi dimostrativi"]) if (!text.includes(expected)) throw new Error(`Missing ${expected}: ${filename}`);
    for (const faq of template.faq) if (!text.includes(compact(faq.domanda)) || !text.includes(compact(faq.risposta))) throw new Error(`FAQ truncated: ${faq.domanda}`);
    for (const block of [dati.modello.blocchi.comeFunziona, dati.modello.blocchi.compreso]) for (const row of [...block.voci, ...block.escluse]) if (!text.includes(compact(row.testo || ""))) throw new Error(`Scope/spec lost: ${row.titolo}`);
    if (variant === "sconto-100" && dati.totali.totale !== 0) throw new Error("100% discount is not zero");
    if (variant === "prezzo-manuale" && (!text.includes("1.098,00") || dati.totali.totale !== 1098)) throw new Error("Manual price mismatch");
    if (variant === "molte-voci") for (let i = 1; i <= 40; i++) if (!text.includes(`ZONA-${i}.`)) throw new Error(`Row ${i} lost`);
    if (variant === "modificato" && (!text.includes("CONTENUTO-LIBERO-QA") || !text.includes("RISPOSTA-OTTO-MODIFICATA") || text.includes("Accessi e parti da proteggere"))) throw new Error("Native edits/order/visibility not propagated");
    const pages = extracted.split("\f").filter(t => t.trim());
    if (pages.some(p => p.trim().length < 40)) throw new Error(`Near-empty page: ${filename}`);
    report.push({ id, variant, pages: pages.length, total: dati.totali.totale, file: filename });
    console.log(id, variant, `${pages.length} pages`, dati.totali.totale.toFixed(2));
  }
}
await writeFile(path.join(output, "facciate-qa.json"), JSON.stringify(report, null, 2));
