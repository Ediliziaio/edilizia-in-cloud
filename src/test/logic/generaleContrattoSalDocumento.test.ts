import { describe, expect, it } from "vitest";
import { buildSalHtml, type ContrattoSal, type SalRecord } from "../../../supabase/functions/generate-sal-pdf/render";

/**
 * Il documento di un SAL di contratto (31/10/2026): stessa funzione dei SAL di commessa
 * (generate-sal-pdf), con in più periodo, dati del contratto e lordo → ritenuta → anticipazione → netto.
 * Numeri del SAL n. 2 della prova a secco in produzione.
 */
const sal: SalRecord = {
  id: "s2", numero_sal: 2, data_emissione: "2026-10-31", stato: "emesso", importo_totale: 62_530, note: null,
  order_id: "g", company_id: "c",
  sal_voci: [
    { id: "v1", descrizione: "O-0025 · A.01 Scavo — 70 m³ × 9 €", importo_contrattuale: 630, percentuale_avanzamento: 100, importo_sal: 630, note: null },
    { id: "v2", descrizione: "ORD-DEM-RIS01 · Ristrutturazione", importo_contrattuale: 85_000, percentuale_avanzamento: 70, importo_sal: 59_500, note: null },
    { id: "v3", descrizione: "Oneri della sicurezza (non soggetti a ribasso)", importo_contrattuale: 30_000, percentuale_avanzamento: 8, importo_sal: 2_400, note: null },
  ],
};
const totale = 630 + 59_500 + 2_400;
const azienda = { ragione_sociale: "Azienda DEMO", partita_iva: null as null, colore_primario: "#1e3a5f", logo_url: null as null };
const contratto = (p: Partial<ContrattoSal> = {}): ContrattoSal => ({
  periodo_dal: "2026-10-21", periodo_al: "2026-10-31", lordo: 17_634, ritenuta_pct: 0.5, ritenuta: 88.17,
  recupero_pct: 20, recupero_anticipazione: 3_526.8, netto: 14_019.03, riferimento_contratto: "Rep. 12/2027",
  cig: "CIG123", cup: "CUP456", split_payment: false, reverse_charge: false, ...p,
});
const html = (c: ContrattoSal | null, precedente = 44_896) =>
  buildSalHtml({ ...sal, importo_totale: totale }, { description: "Appalto scuole", order_code: "C-014", total_amount: 0 }, azienda, null, "DEMO", precedente, c);

describe("il documento del SAL di contratto", () => {
  it("dice periodo e contratto, poi dal lordo al netto da liquidare", () => {
    const h = html(contratto());
    expect(h).toContain("Lavori dal 21/10/2026 al 31/10/2026");
    expect(h).toContain("Contratto Rep. 12/2027 · CIG CIG123 · CUP CUP456");
    expect(h).toContain("Ritenuta di garanzia 0,5%");
    expect(h).toContain("Recupero dell'anticipazione 20%");
    expect(h).toContain("Netto da liquidare");
    expect(h).toContain("14.019,03");
  });

  it("un SAL di commessa resta com'era", () => {
    const h = html(null);
    expect(h).not.toContain("Netto da liquidare");
    expect(h).not.toContain("CIG");
    expect(h).toContain("Quota nuova di questo SAL");
  });

  it("dice come va la fattura con scissione dei pagamenti o inversione contabile", () => {
    expect(html(contratto({ split_payment: true }))).toContain("scissione dei pagamenti");
    expect(html(contratto({ reverse_charge: true }))).toContain("inversione contabile");
  });

  it("si ferma se lordo, ritenuta e netto non tornano o non sono la quota nuova", () => {
    expect(() => html(contratto({ netto: 14_000 }))).toThrow(/Netto/);
    expect(() => html(contratto(), 40_000)).toThrow(/quota nuova/);
  });

  it("senza recupero dell'anticipazione la riga non c'è", () => {
    expect(html(contratto({ recupero_anticipazione: 0, recupero_pct: 0, netto: 17_545.83 }))).not.toContain("anticipazione");
  });
});
