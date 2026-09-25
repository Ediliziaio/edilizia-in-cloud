import { describe, expect, it } from "vitest";
import { calculateOrderEconomics, type EconomicsSources } from "@/lib/orders/economics";
import { paymentOverview } from "@/lib/orders/paymentOverview";
import { calculateGrossFromNet } from "@/lib/vatUtils";

const sources: EconomicsSources = { totalAmount: 1000, items: [], employees: [], teams: [], salespeople: [], errors: [] };
const today = new Date(2026, 8, 25);
describe("Economia condivisa della commessa", () => {
  it("scorpora IVA materiali e subappalto, non quella dei dipendenti", () => {
    const result = calculateOrderEconomics({ ...sources,
      items: [{ purchase_price: 122, quantity: 2, vat_rate: 22 }],
      employees: [{ total_cost: 100 }],
      teams: [{ total_cost: 110, vat_rate: 10 }],
      salespeople: [{ commission_amount: 50, deduction_amount: 10 }],
      errors: [{ amount: 20 }],
    });
    expect(result.costsTot).toBe(460);
    expect(result.margin).toBe(540);
    expect(result.marginPct).toBe(54);
  });
  it("mantiene l'IVA zero e il margine negativo", () => {
    expect(calculateGrossFromNet(1000, 0).grossAmount).toBe(1000);
    const result = calculateOrderEconomics({ ...sources, items: [{ purchase_price: 1200, quantity: 1, vat_rate: 0 }] });
    expect(result.margin).toBe(-200);
    expect(result.marginPct).toBe(-20);
  });
  it("non divide per zero", () => expect(calculateOrderEconomics({ ...sources, totalAmount: 0 }).marginPct).toBe(0));
});
describe("Stato pagamenti in testata", () => {
  it.each([
    [100, 0, "Da incassare", 100],
    [100, 30, "Incassato parzialmente", 70],
    [100, 100, "Saldato", 0],
    [100, 120, "Incasso da verificare", 0],
    [0, 0, "Importo da definire", 0],
  ])("%s totale / %s incassato", (total, collected, status, remaining) => {
    const value = paymentOverview(total, collected, [], today);
    expect(value.status).toBe(status);
    expect(value.remaining).toBe(remaining);
    expect(value.percent).toBeLessThanOrEqual(100);
  });
  it("la scadenza di oggi non è ancora scaduta", () => {
    const value = paymentOverview(100, 30, [{ amount: 70, expected_date: "2026-09-25" }], today);
    expect(value.overdue).toBe(0);
  });
  it("ignora rate pagate, importi zero, finanziaria e date non valide", () => {
    const value = paymentOverview(100, 30, [
      { amount: 10, expected_date: "2026-01-01", is_paid: true },
      { amount: 0, expected_date: "2026-01-01" },
      { amount: 20, type: "financing", expected_date: "2026-01-01" },
      { amount: 70, expected_date: "invalid" },
    ], today);
    expect(value.status).toBe("Incassato parzialmente");
    expect(value.nextDate).toBeNull();
  });
  it("segnala le rate scadute prima dell'incasso parziale", () => {
    const value = paymentOverview(100, 30, [{ amount: 70, expected_date: "2026-09-24" }], today);
    expect(value.status).toBe("Rate scadute");
    expect(value.overdue).toBe(1);
  });
  it("non segnala insoluti quando il target è già incassato", () => {
    expect(paymentOverview(100, 100, [{ amount: 100, expected_date: "2026-01-01" }], today).status).toBe("Saldato");
  });
});
