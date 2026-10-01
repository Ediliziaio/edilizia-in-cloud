import { describe, expect, it } from "vitest";
import { supplierPaymentSchedule, expectedSupplierPayments } from "@/lib/finance/supplierPaymentSchedule";
import { buildOrderItemCosts } from "@/lib/costsUtils";

const item = {
  id: "infissi", name: "Infissi", purchase_price: 1000, quantity: 2,
  payment_method: "50_50", deposit_expected_date: "2026-10-10", balance_expected_date: "2026-11-20",
  deposit_paid: false, balance_paid: false, is_paid: false,
  supplier: { name: "Produttore" }, order: { id: "commessa", order_code: "C-1" },
};

describe("Piano fornitore condiviso fra costi e previsionale", () => {
  it("espone oggi acconto e saldo futuri anche quando l'acconto non è pagato", () => {
    expect(expectedSupplierPayments([item], new Set())).toMatchObject([
      { type: "Acconto Fornitore", amount: 1000, orderItemId: "infissi" },
      { type: "Saldo Fornitore", amount: 1000, orderItemId: "infissi" },
    ]);
  });
  it("dopo l'acconto rimane soltanto il saldo", () => {
    expect(expectedSupplierPayments([{ ...item, deposit_paid: true }], new Set()))
      .toMatchObject([{ type: "Saldo Fornitore", amount: 1000 }]);
  });
  it("stato del saldo indipendente dall'acconto", () => {
    expect(expectedSupplierPayments([{ ...item, balance_paid: true }], new Set()))
      .toMatchObject([{ type: "Acconto Fornitore", amount: 1000 }]);
  });
  it("un pagamento completo non riappare con flag di quota obsoleti", () => {
    expect(expectedSupplierPayments([{ ...item, is_paid: true }], new Set())).toEqual([]);
  });
  it("un articolo già a costo non è contato una seconda volta", () => {
    expect(expectedSupplierPayments([item], new Set([item.id]))).toEqual([]);
  });
  it("la copertura di un altro articolo non sopprime questo debito", () => {
    expect(expectedSupplierPayments([item], new Set(["altro"]))).toHaveLength(2);
  });
  it("30/70 senza importi espliciti conserva la somma della fornitura", () => {
    expect(supplierPaymentSchedule({ ...item, payment_method: "30_70" }).map(p => p.amount)).toEqual([600, 1400]);
  });
  it("zero esplicito di acconto non è sostituito con una percentuale", () => {
    expect(supplierPaymentSchedule({ ...item, deposit_amount: 0 }).map(p => p.amount)).toEqual([0, 2000]);
    expect(expectedSupplierPayments([{ ...item, deposit_amount: 0 }], new Set())).toHaveLength(1);
  });
  it("zero esplicito di saldo resta zero", () => {
    expect(expectedSupplierPayments([{ ...item, deposit_amount: 2000, balance_amount: 0 }], new Set()))
      .toMatchObject([{ type: "Acconto Fornitore", amount: 2000 }]);
  });
  it("mantiene importi e date pattuiti", () => {
    const rows = expectedSupplierPayments([{ ...item, deposit_amount: "800", balance_amount: "1200" }], new Set());
    expect(rows.map(p => p.amount)).toEqual([800, 1200]);
    expect(rows.map(p => p.expectedDate?.toISOString().slice(0, 10))).toEqual(["2026-10-10", "2026-11-20"]);
  });
  it("le due viste applicano gli stessi importi anche con valori null", () => {
    const source = { ...item, deposit_amount: null, balance_amount: null };
    const costs = buildOrderItemCosts([source]);
    const forecast = expectedSupplierPayments([source], new Set());
    expect(costs.map(p => p.amount)).toEqual(forecast.map(p => p.amount));
    expect(costs.map(p => p.due_date)).toEqual(["2026-10-10", "2026-11-20"]);
  });
  it("il costo storico mantiene le quote pagate, il forecast le esclude", () => {
    const source = { ...item, deposit_paid: true };
    expect(buildOrderItemCosts([source])).toMatchObject([{ is_paid: true }, { is_paid: false }]);
    expect(expectedSupplierPayments([source], new Set())).toHaveLength(1);
  });
  it("scadenza mancante rimane mancante e viene ordinata alla fine", () => {
    const rows = expectedSupplierPayments([{ ...item, deposit_expected_date: null }], new Set());
    expect(rows.map(p => p.type)).toEqual(["Saldo Fornitore", "Acconto Fornitore"]);
    expect(rows[1].expectedDate).toBeNull();
  });
  it("quantità zero non viene trasformata in un pezzo da pagare", () => {
    expect(expectedSupplierPayments([{ ...item, quantity: 0 }], new Set())).toEqual([]);
    expect(buildOrderItemCosts([{ ...item, quantity: 0, payment_method: "bonifico" }])[0].amount).toBe(0);
  });
  it("arrotonda l'importo esteso, preservando la precisione del prezzo unitario", () => {
    expect(supplierPaymentSchedule({ purchase_price: 0.12345, quantity: 1000 })[0].amount).toBe(123.45);
  });
  it("le quote derivate quadrano al centesimo anche con totale dispari", () => {
    expect(supplierPaymentSchedule({ ...item, purchase_price: 100.01, quantity: 1 }).map(p => p.amount))
      .toEqual([50.01, 50]);
  });
  it.each([-1, Infinity, NaN])("blocca quantità invalida %s", quantity => {
    expect(() => supplierPaymentSchedule({ ...item, quantity })).toThrow();
  });
  it("un acconto superiore al totale senza saldo esplicito è incoerente", () => {
    expect(() => supplierPaymentSchedule({ ...item, deposit_amount: 2500 })).toThrow();
  });
  it("pagamento singolo usa saldo oppure la data dell'acconto disponibile", () => {
    expect(supplierPaymentSchedule({ ...item, payment_method: "bonifico", balance_expected_date: null })[0])
      .toMatchObject({ amount: 2000, expectedDate: "2026-10-10" });
  });
  it("non aggiunge IVA ipotetica agli importi della convenzione esistente", () => {
    expect(expectedSupplierPayments([item], new Set()).reduce((s, p) => s + p.amount, 0)).toBe(2000);
  });
});
