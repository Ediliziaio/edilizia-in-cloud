import { describe, expect, it } from "vitest";
import { buildForecastLedger, emptyForecastSources, sediciDelMeseDopo, type ReceivedInvoiceRow } from "@/lib/finance/forecastLedger";

const today = "2026-11-01";
const fattura = (patch: Partial<ReceivedInvoiceRow> = {}): ReceivedInvoiceRow => ({
  id: "f1", cedente_ragione_sociale: "Bonarrigo Forniture", numero_fattura: "12", data_fattura: "2026-10-30",
  tipo_documento: "TD01", stato: "non_letta", storico_esterno: false, company_cost_id: null, purchase_order_id: null,
  piano_pagamento: [
    { scadenza: "2026-11-30", importo: 3333.33, modalita: "MP12" },
    { scadenza: "2026-12-31", importo: 3333.33, modalita: "MP12" },
    { scadenza: "2027-01-31", importo: 3333.34, modalita: "MP12" },
  ],
  netto_a_pagare: 10000, totale_documento: 10000, ritenuta_importo: null, ...patch,
});
const uscite = (s: ReturnType<typeof emptyForecastSources>) => buildForecastLedger(s, today).movements.filter((m) => m.direction === "out");

describe("previsionale: fatture arrivate ma non ancora registrate (01/11/2026)", () => {
  it("le RiBa dell'XML escono alle loro date, come stima", () => {
    const s = emptyForecastSources();
    s.receivedInvoices = [fattura()];
    const u = uscite(s);
    expect(u.map((m) => [m.date, m.cents])).toEqual([["2026-11-30", 333333], ["2026-12-31", 333333], ["2027-01-31", 333334]]);
    expect(u.every((m) => m.estimated && m.source === "RiBa da fattura da registrare")).toBe(true);
    expect(u[0].description).toBe("Bonarrigo Forniture · fattura 12 · RiBa 1 di 3");
  });

  it("già registrata (costo), nota di credito, autofattura, storico o rifiutata: niente", () => {
    const s = emptyForecastSources();
    s.receivedInvoices = [
      fattura({ id: "a", company_cost_id: "c1" }), fattura({ id: "b", tipo_documento: "TD04" }),
      fattura({ id: "c", tipo_documento: "self_invoice" }), fattura({ id: "d", storico_esterno: true }),
      fattura({ id: "e", stato: "rifiutata" }),
    ];
    expect(uscite(s)).toHaveLength(0);
  });

  it("la fattura di un ordine d'acquisto prende il posto della stima dell'ordine", () => {
    const s = emptyForecastSources();
    s.purchases = [{ id: "oda1", total: 10000, status: "ricevuto", oda_number: "ODA-1", order_id: null, issue_date: "2026-10-01", expected_delivery_date: null, payment_terms_base: null, payment_terms_giorni: null } as never];
    const soloOrdine = uscite(s).length;
    s.receivedInvoices = [fattura({ purchase_order_id: "oda1" })];
    const u = uscite(s);
    expect(soloOrdine).toBe(1);
    expect(u.filter((m) => m.id.startsWith("fattura-ricevuta:"))).toHaveLength(3);
    expect(u.some((m) => !m.id.startsWith("fattura-ricevuta:"))).toBe(false);
  });

  it("parcella con ritenuta d'acconto: si paga il netto e nasce l'F24 1040 il 16 del mese dopo", () => {
    const s = emptyForecastSources();
    s.receivedInvoices = [fattura({ id: "p", piano_pagamento: [{ scadenza: "2026-11-20", importo: 1020 }], netto_a_pagare: 1020, totale_documento: 1220, ritenuta_importo: 200 })];
    const u = uscite(s);
    expect(u.find((m) => m.id === "fattura-ricevuta:p:1")?.cents).toBe(102000);
    const f24 = u.find((m) => m.id === "f24-1040:p");
    expect(f24).toMatchObject({ date: "2026-12-16", cents: 20000, category: "fisco", estimated: true });
  });

  it("il 1040 non si stima se l'F24 di quel mese è già registrato; vale anche per le fatture già costo", () => {
    const s = emptyForecastSources();
    s.receivedInvoices = [fattura({ id: "p", company_cost_id: "c9", piano_pagamento: [{ scadenza: "2026-11-20", importo: 1020 }], ritenuta_importo: 200 })];
    expect(uscite(s).find((m) => m.id === "f24-1040:p")).toBeDefined();
    // Nell'F24 il mese delle ritenute è quello del pagamento (novembre), non della scadenza (dicembre).
    s.taxes = [{ id: "t", importo: 200, data_scadenza: "2026-12-16", tributo_descrizione: "1040", tributo_code: "1040", anno: 2026, mese: 12 }];
    expect(uscite(s).find((m) => m.id === "f24-1040:p")).toBeDefined();
    s.taxes = [];
    // Anche già pagato: l'F24 registrato toglie la stima.
    s.f24Ritenute = [{ anno: 2026, mese: 11, tributo_code: "1040", stato: "pagato" }];
    expect(uscite(s).find((m) => m.id === "f24-1040:p")).toBeUndefined();
  });

  it("il 16 del mese dopo, anche a dicembre", () => {
    expect(sediciDelMeseDopo("2026-11-20")).toBe("2026-12-16");
    expect(sediciDelMeseDopo("2026-12-05")).toBe("2027-01-16");
  });
});

describe("previsionale: la fattura della ditta già in commessa non si conta due volte (01/11/2026)", () => {
  it("fattura non registrata di una ditta ancora da pagare in commessa: da collegare, non nel piano", () => {
    const s = emptyForecastSources();
    s.teams = [{ id: "t1", total_cost: 10000, vat_rate: 0, payment_date: "2026-11-30", is_paid: false, order_id: "o1",
      external_team: { name: "Edil Rossi", subappaltatore: { piva: "IT01234567890" } } }];
    s.receivedInvoices = [fattura({ cedente_piva: "01234567890" })];
    const piano = buildForecastLedger(s, today);
    const fatture = piano.movements.filter((m) => m.id.startsWith("fattura-ricevuta:"));
    expect(fatture.every((m) => m.possibleDuplicate)).toBe(true);
    expect(piano.movements.find((m) => m.id === "squadra:t1")?.possibleDuplicate).toBeFalsy();
  });

  it("pagata la ditta in commessa, la fattura torna nel piano", () => {
    const s = emptyForecastSources();
    s.teams = [{ id: "t1", total_cost: 10000, vat_rate: 0, payment_date: "2026-11-30", is_paid: true, order_id: "o1",
      external_team: { name: "Edil Rossi", subappaltatore: { piva: "01234567890" } } }];
    s.receivedInvoices = [fattura({ cedente_piva: "01234567890" })];
    expect(buildForecastLedger(s, today).movements.filter((m) => m.id.startsWith("fattura-ricevuta:")).some((m) => m.possibleDuplicate)).toBe(false);
  });
});
