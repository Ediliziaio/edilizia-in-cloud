/** Offline proof using the production renderer; storage/network calls are forbidden. */
import { mock } from "bun:test";
import React from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { leggiBlocco } from "../supabase/functions/_shared/blocchiPreventivo";
import { testiPerPdf } from "../supabase/functions/_shared/testoPerPdf";
import { renderToBuffer } from "@react-pdf/renderer";
mock.module("@/lib/storage/immaginiModelloPdf", () => ({
  CAMPI_IMMAGINE_SERRAMENTI: [], firmaImmagine: async (v: unknown) => v,
  firmaImmaginiModello: async (v: unknown) => v,
}));
mock.module("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: () => { throw new Error("Network forbidden in QA"); } }));
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Remote asset forbidden: ${url}`);
  const bytes = await readFile(path.resolve("public", url.slice(1)));
  return `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
} }));
const { createFullSerramentiTemplate } = await import("../src/lib/moduli-vendita/fullSerramentiModules");
const { findSerramentiTemplateModule } = await import("../src/lib/moduli-vendita/serramentiTemplateModules");
const { buildMockPdfData } = await import("../src/lib/serramenti/mockPdfData");
const { SerramentoPDF } = await import("../src/components/serramenti/SerramentoPDF");
const output = path.resolve(process.argv[2] || "../full-module-qa");
const moduleId = findSerramentiTemplateModule(process.argv[3] || "persiane")?.id;
if (!moduleId) throw new Error(`Modulo sconosciuto: ${process.argv[3]}`);
function extractPdf(name: string): string {
  const r = Bun.spawnSync(["pdftotext", "-layout", path.join(output, name), "-"]);
  assert.equal(r.exitCode, 0, "Estrazione PDF fallita");
  const text = new TextDecoder().decode(r.stdout);
  assert.doesNotMatch(text, /NaN|Infinity|undefined/);
  const plain = Bun.spawnSync(["pdftotext", path.join(output, name), "-"]);
  assert.equal(plain.exitCode, 0);
  const pages = new TextDecoder().decode(plain.stdout).split("\f").map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Native short illustrated chapters must keep all their copy together.
  // This catches the almost-empty continuation sheets missed by bounds checks.
  for (const key of ["comeFunziona", "protezione", "controlli", "documenti", "diario"] as const) {
    const block = testiPerPdf(leggiBlocco(key, "serramenti", template.pdf_blocchi));
    const normalize = (s: string) => s.replace(/\*/g, "").replace(/\s+/g, " ").trim();
    const title = normalize(block.titolo);
    const sectionPage = pages.find(page => page.includes(title));
    assert.ok(sectionPage, `${name}: intestazione ${key} assente`);
    for (const value of [block.intro, ...block.voci.flatMap(v => [v.titolo, v.testo])].filter(Boolean)) {
      assert.ok(sectionPage.includes(normalize(value)), `${name}: ${key} testo perso o isolato: ${value}`);
    }
  }
  return text;
}
await mkdir(output, { recursive: true });
const template = createFullSerramentiTemplate({ company_id: "qa-company", ragione_sociale: "Impresa esempio", email: "info@example.invalid" }, moduleId);
const payload = await buildMockPdfData({ template, moduleId, companyName: "Impresa esempio" });
await writeFile(path.join(output, `serramenti-${moduleId}.pdf`), await renderToBuffer(<SerramentoPDF {...payload} />));
assert.match(extractPdf(`serramenti-${moduleId}.pdf`), /ESCLUSIONI E OPERE DA CONFERMARE/);
console.log(moduleId, "PDF prodotto dal motore originale, senza rete", output);
for (const [name, price, discount] of [["sconto-100", null, 100], ["prezzo-manuale", 1000, 10]] as const) {
  const data = structuredClone(payload);
  Object.assign(data.detail.progetto, { prezzo_manuale: price, sconto_percentuale: discount });
  await writeFile(path.join(output, `${moduleId}-${name}.pdf`), await renderToBuffer(<SerramentoPDF {...data} />));
  const text = extractPdf(`${moduleId}-${name}.pdf`).replace(/\s+/g, " ");
  assert.ok(text.includes(price === null ? "€ 0,00 IVA inclusa" : "€ 1.098,00 IVA inclusa"), `${name}: totale errato`);
}
const stress = structuredClone(payload);
stress.detail.serramenti = Array.from({ length: 25 }, (_, i) => ({ ...stress.detail.serramenti[0], id: `stress-${i}`, position: i, ambiente: `Vano ${i + 1}`, note: "Dimensioni e finiture da confermare in fase di rilievo. ".repeat(8) }));
await writeFile(path.join(output, `${moduleId}-molti-prodotti.pdf`), await renderToBuffer(<SerramentoPDF {...stress} />));
const stressText = extractPdf(`${moduleId}-molti-prodotti.pdf`);
for (let i = 1; i <= 25; i++) assert.ok(stressText.includes(`Vano ${i}`), `Vano ${i} omesso dal PDF`);
if (process.argv.includes("--long-copy")) {
  const long = structuredClone(payload);
  long.detail.progetto.incluso_investimento = Array.from({ length: 12 }, (_, i) => `Lavorazione ${i + 1} compresa — dettagli e quantità da confermare nell'offerta.`);
  long.template!.pdf_blocchi = { ...long.template!.pdf_blocchi, modulo_esclusioni: "ESCLUSIONE DI PROVA PERSONALIZZATA: opere accessorie da concordare separatamente." };
  await writeFile(path.join(output, `${moduleId}-inclusioni-lunghe.pdf`), await renderToBuffer(<SerramentoPDF {...long} />));
  const text = extractPdf(`${moduleId}-inclusioni-lunghe.pdf`);
  for (let i = 1; i <= 12; i++) assert.ok(text.includes(`Lavorazione ${i} compresa`), `Inclusione ${i} persa`);
  assert.ok(text.includes("ESCLUSIONE DI PROVA PERSONALIZZATA"));
}
console.log("PASS: base, esclusioni, prezzo manuale, sconto totale e tutti i 25 prodotti nel PDF.");

if (process.argv.includes("--cover-cases")) {
  const sharp = (await import("sharp")).default;
  const logo = `data:image/png;base64,${(await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="100"><rect x="0" y="0" width="90" height="90" rx="15" fill="#ffffff"/><text x="18" y="65" font-family="sans-serif" font-size="54" fill="#173b43">E</text><text x="115" y="57" font-family="sans-serif" font-size="30" fill="#ffffff">IMPRESA ESEMPIO</text></svg>')).png().toBuffer()).toString("base64")}`;
  const cases: Array<[string, Record<string, unknown>]> = [
    ["logo-editoriale", { pdf_cover_logo_url: logo }],
    ["logo-grande", { pdf_cover_logo_url: logo, pdf_cover_logo_size: 160, pdf_cover_logo_position: "top_center", pdf_cover_text_vertical: "top" }],
    ["senza-foto", { pdf_cover_image_url: null }],
    ["senza-logo-scheda", { pdf_cover_logo_position: "hidden", pdf_cover_show_client_card: false }],
    ["titoli-lunghi", { pdf_cover_logo_url: logo, pdf_cover_hero: "Finestre, persiane e zanzariere.\nUn progetto coordinato per ogni ambiente della tua casa.", pdf_cover_subhero: "Prodotti, finiture e posa: ogni scelta viene descritta nel preventivo e verificata insieme prima della conferma definitiva dell’ordine.", pdf_cover_title_size: 54 }],
    ["classico", { pdf_cover_logo_url: logo, pdf_blocchi: { ...payload.template!.pdf_blocchi, copertina_layout: "classico" } }],
  ];
  for (const [name, overrides] of cases) {
    const data = structuredClone(payload);
    Object.assign(data.template!, overrides);
    data.detail.progetto.created_at = "2026-01-15T12:00:00.000Z";
    const filename = `cover-${name}.pdf`;
    await writeFile(path.join(output, filename), await renderToBuffer(<SerramentoPDF {...data} />));
    extractPdf(filename);
    const cover = Bun.spawnSync(["pdftotext", "-f", "1", "-l", "1", path.join(output, filename), "-"]);
    const text = new TextDecoder().decode(cover.stdout);
    assert.ok(text.includes("15/01/2026"), "Cover must use the quote's date, not today");
    if (name !== "senza-logo-scheda") assert.ok(text.includes("Mario Rossi"), "Client missing on cover");
  }
  console.log("PASS: six cover cases, original quote date, customer, legacy layout and all chapter texts.");
}
