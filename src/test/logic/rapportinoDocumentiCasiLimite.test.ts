/**
 * PDF del rapportino nei casi limite (15/11/2026, simulazioni): commessa a corpo, rapportino vuoto, giornate,
 * ditta esterna, mezzo non venduto. Il testo si legge dal PDF non compresso (senza logo jsPDF non comprime).
 */
import { describe, expect, it } from "vitest";
import { creaPdfOperativo } from "@/lib/documentiOperativi/pdf";
import { documentoPerCommittente, pdfInterno, righeInterne, type QuadroDocumento } from "@/lib/campo/rapportinoDocumenti";
import { normalizzaModelloPdf } from "../../../supabase/functions/_shared/modelliPdfOperativi";

const azienda = { id: "d2000000-0000-4000-a000-000000000002", name: "Demo", business_name: "Demo Azienda 2 S.r.l.", brand_primary_color: "#0F766E", righeSocietarie: ["Demo Azienda 2 S.r.l."] };
const info = { data: "2026-11-06", descrizione: "Prova.", commessa: "SIM-1", cliente: "Mario Verdi" };
const persona = (nome: string, ore: number, prezzo: number | null, extra = {}) => ({
  emp: nome, nome, ditta: false, ore, costo_orario: 28, costo: ore * 28, unita: prezzo == null ? null : "h", quantita: prezzo == null ? null : ore,
  prezzo, ricavo: prezzo == null ? null : ore * prezzo, prezzo_fonte: prezzo == null ? null : ("generale" as const), ...extra,
});
const testo = (pdf: { output: (t: "arraybuffer") => ArrayBuffer }) => Buffer.from(pdf.output("arraybuffer")).toString("latin1");

describe("PDF del rapportino: casi limite", () => {
  it("commessa a corpo: niente margine negativo finto", () => {
    const q: QuadroDocumento = { persone: [persona("Mario Rossi", 8, null)], mezzi: [{ mezzo_id: "m", nome: "BOBCAT", noleggio: false, ore: 3, ore_stimate: false, costo_orario: 18.5, importo: 55.5, prezzo: null, ricavo: null, prezzo_fonte: null }], registrato: true };
    const t = testo(pdfInterno("margine", q, info, azienda));
    expect(t).toContain("a corpo");
    expect(t).toContain("non venduto");
    expect(t).not.toMatch(/-279,50/);
    expect(righeInterne(q).every((r) => r.nonVenduto)).toBe(true);
  });

  it("rapportino vuoto: lo dice, e nessun totale a zero", () => {
    const t = testo(pdfInterno("margine", { persone: [], mezzi: [], voci: [] }, info, azienda));
    expect(t).toContain("Nessuna ora, mezzo o voce registrata");
    expect(t).not.toContain("0,00");
  });

  it("la veste del rapporto in economia vale anche per il documento interno", () => {
    const q: QuadroDocumento = { persone: [persona("Mario Rossi", 8, 40)], registrato: true };
    const modello = normalizzaModelloPdf("economia", { carattere: "times", notaPagina: "Uso riservato", numerazione: false, margine: 18 });
    const t = testo(pdfInterno("costi", q, info, azienda, undefined, modello));
    expect(t).toContain("Uso riservato");
    expect(t).not.toContain("Pag. 1 / 1");
    expect(t).toContain("DOCUMENTO INTERNO"); // il suo, che il modello non tocca
    // Di serie resta la numerazione e la nota «Documento interno».
    const serie = testo(pdfInterno("costi", q, info, azienda));
    expect(serie).toContain("Documento interno · Pag. 1 / 1");
  });

  it("per il committente: ditta nella manodopera, giornate contate, voci nei materiali", () => {
    const q: QuadroDocumento = {
      persone: [persona("Rossi Impianti", 16, 35, { ditta: true, costo: null }), persona("Mario Rossi", 8, 220, { unita: "giornata", quantita: 1, ricavo: 220 })],
      voci: [{ id: "v", descrizione: "Smaltimento cartongesso", quantita: 1, unita: "t", costo_unitario: 140, vendita_unitaria: 150, prezzo_fonte: "generale" }],
    };
    const doc = documentoPerCommittente(q, info, { nome: "Mario Verdi" } as never);
    const t = testo(creaPdfOperativo(doc, azienda));
    expect(t).toContain("780,00"); // manodopera = 560 ditta + 220 giornata
    expect(t).toContain("16 ore + 1 giornata");
    expect(t).toContain("MATERIALI E VOCI");
    expect(t).toContain("150,00");
  });
});
