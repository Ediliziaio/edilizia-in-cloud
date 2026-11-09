/// <reference types="node" />
/**
 * L'anteprima di un modello di «Contratti e condizioni» è il PDF vero (07/11/2026).
 *
 * Florin: «l'anteprima non rispecchia quella reale». Qui si rende davvero il documento — lo stesso
 * foglio delle condizioni — e se ne legge il testo: devono esserci le clausole del modello, coi
 * campi automatici riempiti, e nient'altro.
 */
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { DATI_DI_ESEMPIO, foglioAnteprima, type AziendaPerAnteprima } from "@/lib/condizioni/anteprimaPdf";
import type { ModelloArchivio } from "../../../supabase/functions/_shared/condizioniArchivio";

async function letturaDelPdf(modello: ModelloArchivio, azienda: AziendaPerAnteprima, societari: Parameters<typeof foglioAnteprima>[2] = null): Promise<{ testo: string; pagine: number }> {
  const bytes = await renderToBuffer(foglioAnteprima(modello, azienda, societari));
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let testo = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    testo += (await pagina.getTextContent()).items.map((x) => ("str" in x ? x.str : "")).join(" ") + "\n";
  }
  return { testo: testo.replace(/\s+/g, " "), pagine: doc.numPages };
}

const MODELLO: ModelloArchivio = {
  id: "m1", nome: "Condizioni 2026", ambito: "preventivo", predefinito: true, attivo: true, versione: 2,
  clausole: [
    { titolo: "Oggetto", testo: "<p>{{azienda.ragione_sociale}} esegue i lavori per <strong>{{cliente.nome_completo}}</strong> presso {{cantiere.indirizzo}}.</p>" },
    { titolo: "Foro competente", testo: "<p>Per ogni controversia è competente il Foro di Milano.</p>", vessatoria: true },
  ],
};

describe("L'anteprima è il documento vero", () => {
  it("stampa le clausole del modello, coi campi automatici riempiti con i dati di esempio", async () => {
    const { testo } = await letturaDelPdf(MODELLO, { nome: "Impresa Esempio Srl", colore: "#1f4e79" });
    expect(testo).toContain("Oggetto");
    expect(testo).toContain("Impresa Esempio Srl esegue i lavori");
    expect(testo).toContain(DATI_DI_ESEMPIO.cliente);
    expect(testo).toContain(DATI_DI_ESEMPIO.cantiere);
    expect(testo).toContain("Foro di Milano");
    // Nessun campo lasciato col suo segnaposto.
    expect(testo).not.toMatch(/\{\{/);
  });

  it("è il foglio semplice: niente intestazione del preventivo, logo, titolo grande o accettazione", async () => {
    const { testo, pagine } = await letturaDelPdf(MODELLO, { nome: "Impresa Esempio Srl" });
    expect(testo).not.toMatch(/PIANO DEI LAVORI/i);
    expect(testo).not.toMatch(/PREVENTIVO N\./i);
    expect(testo).not.toContain("ALLEGATO");
    expect(testo).not.toContain("Condizioni contrattuali");
    expect(testo).not.toContain("ACCETTAZIONE PROPOSTA");
    expect(pagine).toBe(1);
  });

  it("uguale per ogni tipo di documento", async () => {
    const preventivo = await letturaDelPdf(MODELLO, { nome: "Impresa Esempio Srl" });
    const variante = await letturaDelPdf({ ...MODELLO, ambito: "commessa" }, { nome: "Impresa Esempio Srl" });
    expect(variante.testo).toBe(preventivo.testo);
  });

  it("in fondo i dati societari, solo quelli che ci sono", async () => {
    const { testo } = await letturaDelPdf(MODELLO, { nome: "Impresa Esempio Srl" }, {
      ragioneSociale: "Impresa Esempio S.r.l.", sede: "Via Roma 1, 20100 Milano (MI)", partitaIva: "01234567890", codiceFiscale: "01234567890",
      pec: "impresa@pec.it", forma_giuridica: "SRL", codice_rea: "123456", rea_ufficio: "MI", capitale_sociale: 10000,
    });
    expect(testo).toContain("Sede legale Via Roma 1, 20100 Milano (MI)");
    expect(testo).toContain("P.IVA 01234567890 · REA MI-123456 · Capitale sociale versato € 10.000,00 · PEC impresa@pec.it");
    expect(testo).not.toContain("C.F.");
  });

  it("la clausola «da approvare a parte» è elencata, per vederla com'esce", async () => {
    const { testo } = await letturaDelPdf(MODELLO, { nome: "Impresa Esempio Srl" });
    expect(testo).toContain("Clausole da approvare specificamente");
    expect(testo).toContain("Foro competente");
  });
});
