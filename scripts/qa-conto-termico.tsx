/**
 * Prova offline del preventivo Conto Termico: stampa il PDF vero con i dati
 * d'esempio e alcune varianti, poi lo stesso documento passando dal
 * preventivatore (modello di libreria → arricchimento → scelta del PDF),
 * senza rete né account.
 * Uso: bun scripts/qa-conto-termico.tsx <cartella>
 */
import { mock } from "bun:test";
import React, { type ReactElement } from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { IdrTemplatePdf } from "../src/types/termoidraulico";
import { ContoTermicoPDF, type ContoTermicoPdfData } from "../src/components/termoidraulico/contoTermico/ContoTermicoPDF";
import { anteprimaContoTermico, FOTO_CONTO_TERMICO_DI_SERIE } from "../src/lib/contoTermico/anteprima";

const immagineLocale = async (url: string) =>
  `data:image/${url.endsWith(".png") ? "png" : "jpeg"};base64,${(await readFile(path.resolve("public", url.slice(1)))).toString("base64")}`;
mock.module("@/integrations/supabase/client", () => ({ supabase: new Proxy({}, { get: () => { throw new Error("Niente rete nella prova del PDF"); } }) }));
mock.module("@/hooks/useTermoidraulicoProgetto", () => ({ getIdrTemplatePdf: () => { throw new Error("Il modello va passato alla prova"); } }));
mock.module("@/lib/pdf/votiOnline", () => ({ votiOnlineAzienda: async () => [] }));
mock.module("@/lib/serramenti/pdfImageUtils", () => ({ toDataUrl: async (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/")) throw new Error(`Immagine remota non ammessa: ${url}`);
  return immagineLocale(url);
} }));

const output = path.resolve(process.argv[2] || "../conto-termico-qa");
await mkdir(output, { recursive: true });

const fotoLocali = Object.fromEntries(await Promise.all(Object.entries(FOTO_CONTO_TERMICO_DI_SERIE).map(async ([k, url]) => [k, await immagineLocale(url)])));

const varianti: Record<string, (d: ContoTermicoPdfData) => void> = {
  "sconto-in-fattura": () => {},
  "rimborso-unica-rata": (d) => { d.economia.modalita = "rimborso"; },
  "rimborso-due-rate": (d) => { d.economia.modalita = "rimborso"; d.economia.prezzoIvaInclusa = 34000; d.economia.contributo = 17500; d.economia.potenzaKw = 16; },
  "senza-foto-senza-detrazione": (d) => { d.foto = {}; d.economia.detrazionePct = null; d.intervento.caratteristiche = []; },
  "senza-risparmio": (d) => { d.economia.spesaAnnuaNuova = 2300; },
};

async function stampa(nome: string, documento: ReactElement, attesi: string[] = []) {
  const file = path.join(output, `conto-termico-${nome}.pdf`);
  await writeFile(file, await renderToBuffer(documento as ReactElement<DocumentProps>));
  const testo = execFileSync("pdftotext", [file, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  const problemi = [
    /\b(?:NaN|Infinity|undefined|null)\b/.test(testo) ? "valore non valido stampato" : null,
    !testo.includes("FIRMA DEL COMMITTENTE") ? "manca la firma" : null,
    ...attesi.filter((t) => !testo.includes(t)).map((t) => `manca «${t}»`),
  ].filter(Boolean);
  const pagine = execFileSync("pdfinfo", [file], { encoding: "utf8" }).match(/Pages:\s+(\d+)/)?.[1];
  console.log(nome, `${pagine} pagine`, problemi.length ? problemi.join("; ") : "ok");
  if (problemi.length) process.exitCode = 1;
}

for (const [nome, cambia] of Object.entries(varianti)) {
  const data = anteprimaContoTermico(fotoLocali);
  cambia(data);
  await stampa(nome, <ContoTermicoPDF data={data} />);
}

// Dal preventivatore: il modello di libreria, l'arricchimento vero e la scelta del documento.
const { createFullIdrTemplate, buildIdrModulePreview } = await import("../src/lib/moduli-vendita/fullIdrModules");
const { enrichTermoidraulicoPdf, elementoPdf } = await import("../src/hooks/useTermoidraulicoPDF");
const modello = createFullIdrTemplate({
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22, condizioni_legali_attivo: false,
} as IdrTemplatePdf, "conto-termico");
const preventivo = buildIdrModulePreview("qa-company", modello, "conto-termico");
Object.assign(preventivo.progetto, { cliente_nome: "Anna", cliente_cognome: "Bianchi", cantiere_citta: "Milano" });
const arricchito = await enrichTermoidraulicoPdf({ ...preventivo, company: { name: "Impresa esempio", ragione_sociale: "Impresa esempio", email: "info@example.invalid" } });
// 12.500 € di righe più IVA al 10%: 13.750 €, meno i 4.800 € del contributo.
await stampa("dal-preventivatore", await elementoPdf(arricchito), ["Anna Bianchi", "13.750", "4.800", "8.950", "Impresa esempio"]);
