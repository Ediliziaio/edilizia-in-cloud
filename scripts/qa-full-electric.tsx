/**
 * Prova offline del preventivo Casa Full Electric: stampa il PDF vero con i dati
 * d'esempio e alcune varianti, poi lo stesso documento passando dal
 * preventivatore (modello di libreria → arricchimento → scelta del PDF),
 * senza rete né account.
 * Uso: bun scripts/qa-full-electric.tsx <cartella>
 */
import { mock } from "bun:test";
import React, { type ReactElement } from "react";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { IdrTemplatePdf } from "../src/types/termoidraulico";
import { FullElectricPDF, type FullElectricPdfData } from "../src/components/termoidraulico/fullElectric/FullElectricPDF";
import { anteprimaFullElectric, FOTO_FULL_ELECTRIC_DI_SERIE, FOTO_PEZZI_FULL_ELECTRIC } from "../src/lib/fullElectric/anteprima";

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

const output = path.resolve(process.argv[2] || "../full-electric-qa");
await mkdir(output, { recursive: true });

const tutte = { ...FOTO_FULL_ELECTRIC_DI_SERIE, ...FOTO_PEZZI_FULL_ELECTRIC };
const fotoLocali = Object.fromEntries(await Promise.all(Object.entries(tutte).filter(([, url]) => url).map(async ([k, url]) => [k, await immagineLocale(url as string)])));

async function stampa(nome: string, documento: ReactElement, attesi: string[] = []) {
  const file = path.join(output, `full-electric-${nome}.pdf`);
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

const varianti: Record<string, (d: FullElectricPdfData) => void> = {
  "esempio": () => {},
  "senza-incentivi": (d) => { d.economia.incentivi = { detrazionePct: null, importoDetraibile: null, contributoCt: 0, modalitaCt: "sconto_in_fattura" }; },
  "conto-termico-a-rimborso": (d) => { d.economia.incentivi.modalitaCt = "rimborso"; },
  "senza-foto": (d) => { d.foto = {}; },
  "tutti-i-pezzi": (d) => {
    d.sistema.componenti = [...d.sistema.componenti,
      { tipo: "scaldacqua", titolo: "Scaldacqua a pompa di calore", dettaglio: "200 litri" },
      { tipo: "climatizzazione", titolo: "Climatizzazione dual split", dettaglio: "Soggiorno e camera" },
      { tipo: "wallbox", titolo: "Wallbox 7,4 kW", dettaglio: "Con gestione dei carichi" }];
  },
  "senza-pezzi": (d) => { d.sistema.componenti = []; },
  "senza-dati-energia": (d) => { d.economia.domani = { produzioneKwh: 0, consumoKwh: 0, autoconsumoPct: 60, prezzoLuce: 0.28, prezzoImmissione: 0.1, quotaFissa: 0 }; d.economia.oggi = { spesaGas: 0, spesaLuce: 0, gasSmc: 0, luceKwh: 0 }; },
};

for (const [nome, cambia] of Object.entries(varianti)) {
  const data = anteprimaFullElectric(fotoLocali);
  cambia(data);
  await stampa(nome, <FullElectricPDF data={data} />, nome === "esempio" ? ["28.600", "171", "63%", "7.500 kWh", "2,8 t", "8,3 anni", "Casa Full Electric"] : []);
}

// Dal preventivatore: il modello di libreria, l'arricchimento vero e la scelta del documento.
const { createFullIdrTemplate, buildIdrModulePreview } = await import("../src/lib/moduli-vendita/fullIdrModules");
const { enrichTermoidraulicoPdf, elementoPdf } = await import("../src/hooks/useTermoidraulicoPDF");
const base = {
  id: "qa", company_id: "qa-company", logo_url: null, cover_logo_url: null,
  ragione_sociale: "Impresa esempio", email: "info@example.invalid", font_family: "helvetica",
  color_primary: "#563e32", color_accent: "#b66b42", default_iva_pct: 22, condizioni_legali_attivo: false,
  chi_siamo: "<p>Installiamo fotovoltaico e pompe di calore dal 2010, con squadre nostre.</p><p>Per ogni casa hai <strong>un solo referente</strong>, dal sopralluogo all'addio al gas.</p>",
  payment_terms_text: "<ul><li>30% alla firma del contratto</li><li>70% a fine lavori</li></ul>",
} as unknown as IdrTemplatePdf;

async function dalPreventivatore(nome: string, modello: IdrTemplatePdf, extra: { media?: boolean } = {}, attesi: string[] = [], vietatiInCopertina: string[] = []) {
  const preventivo = buildIdrModulePreview("qa-company", modello, "full-electric");
  Object.assign(preventivo.progetto, { cliente_nome: "Anna", cliente_cognome: "Bianchi", cantiere_citta: "Milano", immobile_tipo: "casa_indipendente", immobile_anno: 1985, tipo_generatore: "pompa_calore" });
  const media = extra.media ? [
    { id: "m1", progetto_id: "preview", company_id: "qa-company", url: "/module-art/termoidraulica-caldaia.jpg", caption: "La caldaia di oggi, al sopralluogo", ordine: 0 },
    { id: "m2", progetto_id: "preview", company_id: "qa-company", url: "/pdf-stock/fotovoltaico/vista-drone.jpg", caption: "La falda dove andranno i moduli", ordine: 1 },
    { id: "m3", progetto_id: "preview", company_id: "qa-company", url: "/pdf-stock/termoidraulico/pompa-di-calore.jpg", caption: "Dove andrà l'unità esterna", ordine: 2 },
  ] : [];
  const arricchito = await enrichTermoidraulicoPdf({ ...preventivo, media: media as never, company: { name: "Impresa esempio", ragione_sociale: "Impresa esempio", email: "info@example.invalid" } });
  await stampa(nome, await elementoPdf(arricchito), attesi);
  const file = path.join(output, `full-electric-${nome}.pdf`);
  const copertina = execFileSync("pdftotext", ["-f", "1", "-l", "1", file, "-"], { encoding: "utf8" });
  const trovati = vietatiInCopertina.filter((t) => copertina.includes(t));
  if (trovati.length) { console.log(nome, "in copertina non ci deve essere:", trovati.join(", ")); process.exitCode = 1; }
}

// Il modello così come lo crea la libreria.
await dalPreventivatore("dal-preventivatore", createFullIdrTemplate(base, "full-electric"), {},
  // 26.000 € di righe più IVA al 10%: 28.600 €; le stime d'esempio danno 2.054 € l'anno di risparmio.
  ["Anna Bianchi", "28.600", "2.054", "Impresa esempio", "Chi c'è dietro", "voce per voce", "IL SISTEMA PROPOSTO", "Perché sceglierci", "Un solo progetto", "Pratiche seguite", "Modalità di pagamento", "Casa indipendente"],
  ["€", "RISPARMIO"]);

// Il modello personalizzato dall'azienda nell'editor: recensioni, lavori, condizioni, recesso, foto del preventivo.
const personalizzato = {
  ...createFullIdrTemplate(base, "full-electric"),
  condizioni_legali_attivo: true, modulo_recesso_attivo: true,
  testimonianze: [
    { autore: "Giulia S.", ruolo: "Monza", testo: "Addio al gas in tre settimane: una bolletta sola e l'app per vedere l'energia.", voto: 5 },
    { autore: "Marco T.", ruolo: "Sesto San Giovanni", testo: "D'estate la casa va quasi solo col tetto." },
  ],
  gallery_lavori: [
    { id: "l1", url: "/pdf-stock/fotovoltaico/villa-tetto-piano.jpg", didascalia: "Fotovoltaico 8 kWp con batteria", luogo: "Monza" },
    { id: "l2", url: "/pdf-stock/termoidraulico/pompa-di-calore.jpg", didascalia: "Pompa di calore 10 kW", luogo: "Milano" },
  ],
} as unknown as IdrTemplatePdf;
await dalPreventivatore("personalizzato", personalizzato, { media: true },
  ["GIULIA S.", "Pompa di calore 10 kW", "La caldaia di oggi, al sopralluogo", "Condizioni contrattuali", "approva specificamente", "Firma del contratto", "Modulo di recesso"],
  ["€"]);
