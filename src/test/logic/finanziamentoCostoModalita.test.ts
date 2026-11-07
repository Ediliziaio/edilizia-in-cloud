import { describe, expect, it } from "vitest";
import { riepilogoFinanziamento } from "@/lib/finanziamenti/costoFinanziaria";
import { rateDaIncassare, importoSaldoFinale } from "@/lib/orders/saldoFinale";
import { incassiDellaCommessa } from "@/lib/orders/incassiCommessa";
import { calculateInstallmentCollections } from "@/lib/commissions";

const rate = [
  { type: "deposit", amount: 2000, position: 0, is_paid: true },
  { type: "financing", amount: 6000, position: 1, is_paid: true },
  { type: "balance", amount: 0, position: 2, is_paid: true },
];
const base = { totaleContratto: 10000, accontiCliente: 2000, quotaFinanziata: 6000, costo: 300 };
describe("Costo della finanziaria distinto dal saldo cliente", () => {
  it.each(["trattenuto", "separato"] as const)("saldo invariato con costo %s", modalita => {
    expect(importoSaldoFinale(rate, 10000, 300, modalita)).toBe(2000);
    expect(riepilogoFinanziamento({ ...base, modalita }).saldoCliente).toBe(2000);
  });
  it("trattiene dall'erogazione, senza una seconda uscita", () => {
    expect(riepilogoFinanziamento({ ...base, modalita: "trattenuto" })).toEqual({
      saldoCliente: 2000, incassoFinanziaria: 5700, uscitaSeparata: 0, costoEconomico: 300, entrateComplessive: 9700,
    });
  });
  it("mantiene l'erogazione intera per il costo separato", () => {
    expect(riepilogoFinanziamento({ ...base, modalita: "separato" })).toEqual({
      saldoCliente: 2000, incassoFinanziaria: 6000, uscitaSeparata: 300, costoEconomico: 300, entrateComplessive: 10000,
    });
  });
  it.each(["trattenuto", "separato"] as const)("riconcilia rate e totale incassato: %s", financingCostMode => {
    const input = { installments: rate, totalAmount: 10000, vatRate: 0, financingCost: 300, financingCostMode, includeFinancing: true };
    expect(calculateInstallmentCollections(input)).toEqual([2000, financingCostMode === "trattenuto" ? 5700 : 6000, 2000]);
    const incassi = incassiDellaCommessa({ ...input, paymentType: "financing" });
    expect(incassi.incassatoLordo).toBe(incassi.totaleLordo);
    expect(incassi.daIncassareLordo).toBe(0);
    expect(incassi.costoFinanziaria).toBe(300);
  });
  it("mantiene la lettura storica finché manca la modalità verificata", () => {
    expect(importoSaldoFinale(rate, 10000, 300)).toBe(1700);
    expect(calculateInstallmentCollections({ installments: rate, totalAmount: 10000, vatRate: 0, financingCost: 300, includeFinancing: true })).toEqual([2000, 6000, 1700]);
  });
  it("non sottrae il costo dai SAL intermedi", () => {
    const piano = [...rate.slice(0, 2), { type: "balance", amount: 500, position: 2, is_paid: true }, { type: "balance", amount: 0, position: 3, is_paid: true }];
    expect(calculateInstallmentCollections({ installments: piano, totalAmount: 10000, vatRate: 0, financingCost: 300, financingCostMode: "trattenuto", includeFinancing: true })).toEqual([2000, 5700, 500, 1500]);
  });
  it("gestisce il finanziamento totale e i centesimi senza saldo negativo", () => {
    expect(riepilogoFinanziamento({ totaleContratto: 100.01, accontiCliente: 0, quotaFinanziata: 100.01, costo: 0.02, modalita: "trattenuto" })).toEqual({ saldoCliente: 0, incassoFinanziaria: 99.99, uscitaSeparata: 0, costoEconomico: 0.02, entrateComplessive: 99.99 });
  });
  it("rifiuta trattenute impossibili e importi non validi", () => {
    expect(() => riepilogoFinanziamento({ ...base, costo: 6001, modalita: "trattenuto" })).toThrow();
    expect(() => riepilogoFinanziamento({ ...base, quotaFinanziata: 9000, modalita: "separato" })).toThrow();
    expect(() => riepilogoFinanziamento({ ...base, costo: NaN, modalita: "separato" })).toThrow();
  });
  it("non inventa come dividere una trattenuta fra più erogazioni", () => {
    expect(() => calculateInstallmentCollections({ installments: [...rate, { type: "financing", amount: 1000, is_paid: false }], totalAmount: 10000, vatRate: 0, financingCost: 300, financingCostMode: "trattenuto" })).toThrow("singola erogazione");
  });
});

// Il piano dei crediti deve concordare con gli incassi e non creare residui fittizi.
describe("Scadenzario con modalità finanziaria", () => {
  it.each(["trattenuto", "separato"] as const)("rate aperte e parzialmente pagate: %s", financing_cost_mode => {
    const piano = rate.map((r, i) => ({ ...r, id: String(i), order_id: "ordine", is_paid: false, expected_date: null as null, documento_fiscale_id: i === 2 ? "fattura" : null }));
    const result = rateDaIncassare(piano, new Map([["ordine", { total_amount: 10000, vat_rate: 0, payment_type: "financing", financing_cost: 300, financing_cost_mode }]]), new Map([["fattura", 500]]));
    expect(result.map(r => r.amount)).toEqual([2000, financing_cost_mode === "trattenuto" ? 5700 : 6000, 1500]);
    expect(result).toHaveLength(3);
  });
});
