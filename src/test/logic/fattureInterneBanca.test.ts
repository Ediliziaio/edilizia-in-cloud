/**
 * Tesoreria e fatture interne (25/09/2026): le fatture della fatturazione
 * interna compaiono tra quelle da incassare, un bonifico le riconosce anche
 * dal numero breve («37/2026»), e la loro riconciliazione si scollega con lo
 * storno, non toccando la scadenza a mano.
 */
import { describe, expect, it } from "vitest";
import { computeMatchScore, detectReconAnomalies } from "@/lib/finance/reconciliationAnalysis";
import {
  candidatoDaFatturaInterna,
  eFatturaInterna,
  eRiconciliazioneFatturaInterna,
  fattureInterneDaIncassare,
  nomeClienteSnapshot,
  STATI_INCASSABILI_DA_BANCA,
  TIPI_INCASSABILI_DA_BANCA,
  type FatturaInternaDaIncassare,
} from "@/lib/finance/fattureInterneBanca";

const fattura = (extra: Partial<FatturaInternaDaIncassare> = {}): FatturaInternaDaIncassare => ({
  id: "doc-1",
  numero: "FT-2026-0037",
  numero_progressivo: 37,
  anno: 2026,
  cliente_snapshot: { ragione_sociale: "Rossi Costruzioni Srl" },
  totale_da_pagare: "6171.00",
  importo_pagato: "0",
  stato: "consegnata",
  data_scadenza: "2026-10-31",
  data_emissione: "2026-09-20",
  ...extra,
});

describe("la fattura interna ha la forma delle fatture che la riconciliazione conosce", () => {
  it("numero, numero breve, cliente, residuo e scadenza", () => {
    const c = candidatoDaFatturaInterna(fattura());
    expect(c).toMatchObject({
      id: "doc-1",
      fonte: "interna",
      invoice_number: "FT-2026-0037",
      numero_breve: "37/2026",
      client_company_name: "Rossi Costruzioni Srl",
      total: 6171,
      paid_amount: 0,
      due_date: "2026-10-31",
      external_provider: null,
    });
    expect(eFatturaInterna(c)).toBe(true);
    expect(eFatturaInterna({ id: "x", external_provider: "fattureincloud" })).toBe(false);
  });

  it("una persona fisica senza ragione sociale: nome e cognome", () => {
    expect(nomeClienteSnapshot({ ragione_sociale: "", nome: "Mario", cognome: "Bianchi" })).toBe("Mario Bianchi");
    expect(nomeClienteSnapshot(null)).toBe("");
  });

  it("scaduta conta come «overdue» per le anomalie", () => {
    const c = candidatoDaFatturaInterna(fattura({ stato: "scaduta", data_scadenza: null }));
    const anomalie = detectReconAnomalies([], [c]);
    expect(anomalie.find((a) => a.id === "overdue")?.ids).toEqual(["doc-1"]);
  });

  it("restano solo quelle con qualcosa da incassare", () => {
    const elenco = fattureInterneDaIncassare([
      fattura(),
      fattura({ id: "doc-2", importo_pagato: "6171.00" }),
      fattura({ id: "doc-3", importo_pagato: "6170.999" }),
      fattura({ id: "doc-4", importo_pagato: "1000" }),
    ]);
    expect(elenco.map((c) => c.id)).toEqual(["doc-1", "doc-4"]);
  });

  it("si incassano con un bonifico le fatture emesse e non saldate, non note di credito, DDT o bozze", () => {
    expect(TIPI_INCASSABILI_DA_BANCA).toContain("fattura");
    expect(TIPI_INCASSABILI_DA_BANCA).not.toContain("nota_credito");
    expect(TIPI_INCASSABILI_DA_BANCA).not.toContain("proforma");
    expect(TIPI_INCASSABILI_DA_BANCA).not.toContain("ddt");
    for (const s of ["bozza", "in_invio", "pagata", "annullata", "stornata", "rifiutata"]) {
      expect(STATI_INCASSABILI_DA_BANCA).not.toContain(s);
    }
  });
});

describe("il bonifico riconosce la fattura interna dalla causale", () => {
  const candidato = candidatoDaFatturaInterna(fattura());

  it("dal numero breve, come lo scrive chi paga", () => {
    const m = computeMatchScore({ amount: 6171, description: "SALDO FATTURA 37/2026 CANTIERE VIA ROMA" }, candidato);
    expect(m?.reasons).toContain("N° fattura in causale");
    expect(m?.score).toBeGreaterThanOrEqual(110);
    // Il suggerimento mostra il numero vero, non quello breve.
    expect(m?.invoice.invoice_number).toBe("FT-2026-0037");
  });

  it("e dal numero intero", () => {
    const m = computeMatchScore({ amount: 100, description: "Acconto FT-2026-0037" }, candidato);
    expect(m?.reasons).toContain("N° fattura in causale");
  });

  it("senza numero, importo e nome da soli non bastano per l'abbinamento automatico", () => {
    const m = computeMatchScore(
      { amount: 6171, debtor_name: "ROSSI COSTRUZIONI SRL", description: "Bonifico" },
      candidato,
    );
    expect(m?.score).toBe(70);
  });

  it("una fattura esterna non ha il numero breve: il comportamento resta quello di prima", () => {
    const m = computeMatchScore(
      { amount: 999, description: "saldo fattura 37/2026" },
      { invoice_number: "FT-2026-0037", total: 5000, paid_amount: 0 },
    );
    expect(m).toBeNull();
  });
});

describe("scollegare l'incasso di una fattura interna è uno storno", () => {
  it("la riconoscono il movimento registrato o la scadenza «entrata» della fattura", () => {
    expect(eRiconciliazioneFatturaInterna({ movimento_id: "mov-1" })).toBe(true);
    // Movimento già sparito (FK a NULL): la scadenza è quella della fattura.
    expect(eRiconciliazioneFatturaInterna({ movimento_id: null, scadenze: { direction: "entrata" } })).toBe(true);
  });

  it("le uscite verso un fornitore e le fatture esterne restano sul loro ramo", () => {
    expect(eRiconciliazioneFatturaInterna({ movimento_id: null, scadenze: { direction: "uscita" } })).toBe(false);
    expect(eRiconciliazioneFatturaInterna({ movimento_id: null, scadenze: null })).toBe(false);
  });
});
