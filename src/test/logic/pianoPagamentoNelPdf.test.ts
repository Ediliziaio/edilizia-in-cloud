/**
 * Il piano di pagamento nel PDF del preventivo edile (26/10/2026): le rate di questo preventivo, col «quando» e con
 * gli importi, al posto della frase generica del modello. Un piano che non copre il prezzo non esce.
 */
import { describe, expect, it } from "vitest";
import { costruisciDatiEdile, type ProgettoComune } from "@/components/preventivi/pdf/adattatoreEdile";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

const PROGETTO: ProgettoComune = {
  code: "RST-2026-014", tipo_intervento: "Ristrutturazione completa",
  cliente_nome: "Mario", cliente_cognome: "Rossi",
  cantiere_indirizzo: "Via Roma 1", cantiere_citta: "Torino", cantiere_provincia: "TO", cantiere_cap: "10100",
  immobile_tipo: "Appartamento", immobile_superficie_mq: 90, immobile_anno: 1975, immobile_piani: 1,
};
const TOTALI = {
  imponibileLordo: 10000, scontoEur: 0, scontoPct: 0, imponibile: 10000, iva: 1000, ivaPct: 10, totale: 11000,
  detrazionePct: 0, detrazioneEur: 0, costoTot: 6000, margineEur: 4000, marginePct: 40,
};
const dati = (piano: unknown) => costruisciDatiEdile({
  modulo: MODULI_EDILI.ristrutturazione,
  progetto: { ...PROGETTO, piano_pagamento: piano } as ProgettoComune,
  template: { payment_terms_text: "<p>Come da accordi.</p>" }, azienda: null, capitoli: [], totali: TOTALI, media: [],
});

describe("il piano nel documento", () => {
  it("le rate escono col nome, il «quando» e l'importo sul totale IVA inclusa", () => {
    const d = dati({ modo: "rate", righe: [
      { nome: "Acconto alla firma", percent: 30, evento: "firma_contratto", numero: null },
      { nome: "Saldo", percent: 70, evento: "fine_lavori", numero: null },
    ], note: "Bonifico bancario." });
    expect(d.pianoPagamento).toEqual({
      righe: [
        { nome: "Acconto alla firma", quando: "Alla firma del contratto", percent: 30, importo: 3300 },
        { nome: "Saldo", quando: "A fine lavori", percent: 70, importo: 7700 },
      ],
      note: "Bonifico bancario.",
    });
  });

  it("un piano a SAL porta il numero del SAL nel «quando»", () => {
    const d = dati({ modo: "sal", righe: [
      { nome: "Acconto", percent: 20, evento: "firma_contratto", numero: null },
      { nome: "SAL 1", percent: 40, evento: "sal_numero", numero: 1 },
      { nome: "SAL 2", percent: 40, evento: "sal_numero", numero: 2 },
    ], note: null });
    expect(d.pianoPagamento!.righe.map((r) => r.quando)).toEqual(["Alla firma del contratto", "Al SAL 1", "Al SAL 2"]);
    expect(d.pianoPagamento!.righe.map((r) => r.importo)).toEqual([2200, 4400, 4400]);
  });

  it("le rate sommano esattamente al totale, anche con percentuali che non tornano tonde", () => {
    const d = dati({ modo: "rate", righe: [
      { nome: "A", percent: 33.33, evento: "firma_contratto", numero: null },
      { nome: "B", percent: 33.33, evento: "inizio_lavori", numero: null },
      { nome: "C", percent: 33.34, evento: "fine_lavori", numero: null },
    ], note: null });
    expect(d.pianoPagamento!.righe.reduce((s, r) => s + r.importo, 0)).toBe(11000);
  });

  it("senza piano, o con un piano che non copre il prezzo, nel PDF resta la frase del modello", () => {
    expect(dati(null).pianoPagamento).toBeNull();
    expect(dati({ modo: "rate", righe: [{ nome: "Acconto", percent: 40, evento: "firma_contratto", numero: null }], note: null }).pianoPagamento).toBeNull();
    expect(dati("non un piano").pianoPagamento).toBeNull();
    expect(dati(null).modello.pagamentoHtml).toContain("Come da accordi");
  });
});
