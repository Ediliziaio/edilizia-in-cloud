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
const base = {
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22, condizioni_legali_attivo: false,
  chi_siamo: "<p>Siamo termotecnici dal 2008: installiamo pompe di calore e sistemi ibridi con squadre nostre.</p><p>Per ogni cantiere hai <strong>un solo referente</strong>, dal sopralluogo alla domanda al GSE.</p>",
  payment_terms_text: "<ul><li>30% alla firma del contratto</li><li>70% a fine lavori</li></ul>",
} as unknown as IdrTemplatePdf;

async function dalPreventivatore(nome: string, modello: IdrTemplatePdf, extra: { media?: boolean } = {}, attesi: string[] = [], vietatiInCopertina: string[] = []) {
  const preventivo = buildIdrModulePreview("qa-company", modello, "conto-termico");
  Object.assign(preventivo.progetto, { cliente_nome: "Anna", cliente_cognome: "Bianchi", cantiere_citta: "Milano", immobile_tipo: "casa_indipendente", immobile_anno: 1985, tipo_generatore: "pompa_calore" });
  const media = extra.media ? [
    { id: "m1", progetto_id: "preview", company_id: "qa-company", url: "/module-art/termoidraulica-caldaia.jpg", caption: "La caldaia di oggi, al sopralluogo", ordine: 0 },
    { id: "m2", progetto_id: "preview", company_id: "qa-company", url: "/pdf-stock/termoidraulico/pompa-di-calore.jpg", caption: "Dove andrà l'unità esterna", ordine: 1 },
    { id: "m3", progetto_id: "preview", company_id: "qa-company", url: "/module-art/termoidraulica.jpg", caption: "Il locale tecnico", ordine: 2 },
  ] : [];
  const arricchito = await enrichTermoidraulicoPdf({ ...preventivo, media: media as never, company: { name: "Impresa esempio", ragione_sociale: "Impresa esempio", email: "info@example.invalid" } });
  await stampa(nome, await elementoPdf(arricchito), attesi);
  const file = path.join(output, `conto-termico-${nome}.pdf`);
  const copertina = execFileSync("pdftotext", ["-f", "1", "-l", "1", file, "-"], { encoding: "utf8" });
  const trovati = vietatiInCopertina.filter((t) => copertina.includes(t));
  if (trovati.length) { console.log(nome, "in copertina non ci deve essere:", trovati.join(", ")); process.exitCode = 1; }
}

// Il modello così come lo crea la libreria.
await dalPreventivatore("dal-preventivatore", createFullIdrTemplate(base, "conto-termico"), {},
  // 12.500 € di righe più IVA al 10%: 13.750 €, meno i 4.800 € del contributo.
  ["Anna Bianchi", "13.750", "4.800", "8.950", "Impresa esempio", "Chi c'è dietro", "voce per voce", "IL MODELLO PROPOSTO", "Perché sceglierci", "Garanzia del produttore", "Modalità di pagamento", "Casa indipendente"],
  ["€", "CONTRIBUTO", "RESTA A TE"]);

// Il modello personalizzato dall'azienda nell'editor: recensioni, lavori, condizioni, recesso, foto del preventivo.
const personalizzato = {
  ...createFullIdrTemplate(base, "conto-termico"),
  condizioni_legali_attivo: true, modulo_recesso_attivo: true,
  testimonianze: [
    { autore: "Giulia S.", ruolo: "Monza", testo: "Pratica GSE seguita dall'inizio alla fine, contributo arrivato come previsto.", voto: 5 },
    { autore: "Marco T.", ruolo: "Sesto San Giovanni", testo: "Casa calda e bollette dimezzate già dal primo inverno." },
  ],
  gallery_lavori: [
    { id: "l1", url: "/module-art/termoidraulica-pompa-calore-cover.jpg", didascalia: "Pompa di calore 10 kW", luogo: "Monza" },
    { id: "l2", url: "/pdf-stock/termoidraulico/risultato.jpg", didascalia: "Locale tecnico rifatto", luogo: "Milano" },
  ],
} as unknown as IdrTemplatePdf;
await dalPreventivatore("personalizzato", personalizzato, { media: true },
  ["GIULIA S.", "Pompa di calore 10 kW", "La caldaia di oggi, al sopralluogo", "Condizioni contrattuali", "approva specificamente", "Firma del contratto", "Modulo di recesso"],
  ["€"]);
