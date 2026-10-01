import { describe, expect, it } from "vitest";
import {
  assessOrderEconomicsQuality,
  calculateOrderEconomics,
  canonicalOrderEconomics,
  orderVehicleCostEstimate,
  type EconomicsSources,
} from "@/lib/orders/economics";
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

  it("normalizza lo snapshot ufficiale senza ricalcolare il margine", () => {
    const actual = canonicalOrderEconomics({
      preventivo_contratto: 1000,
      variazioni_approvate: 100,
      preventivo_totale: 1100,
      costo_acquisti: 300,
      costo_materiali_magazzino: 80,
      movimenti_magazzino_senza_costo: 0,
      costo_manodopera: 200,
      costo_provvigioni: 50,
      costo_rimborsi_km: 25,
      rimborsi_km_da_approvare: 12,
      numero_rimborsi_km_da_approvare: 1,
      costo_errori: 20,
      costo_diretto: 30,
      consuntivo: 600,
      margine: 500,
      margine_perc: 45.5,
    });
    expect(actual).toMatchObject({
      revenue: 1100,
      costs: 600,
      margin: 500,
      marginPct: 45.5,
      directCosts: 30,
      warehouseMaterials: 80,
      mileageReimbursements: 25,
      pendingMileageReimbursements: 12,
      pendingMileageReimbursementsCount: 1,
    });
  });

  it("non considera attendibile un margine al 100% senza costi", () => {
    const actual = canonicalOrderEconomics({ preventivo_totale: 1000, consuntivo: 0, margine: 1000, margine_perc: 100 });
    const quality = assessOrderEconomicsQuality({ sourceAvailable: true, actual, items: [], employees: [], teams: [] });
    expect(quality.status).toBe("missing");
    expect(quality.canShowMargin).toBe(false);
    expect(quality.issues.map((issue) => issue.code)).toContain("no_registered_costs");
  });

  it("marca come parziale il margine quando esistono righe senza costo", () => {
    const actual = canonicalOrderEconomics({ preventivo_totale: 1000, consuntivo: 300, margine: 700, margine_perc: 70 });
    const quality = assessOrderEconomicsQuality({
      sourceAvailable: true,
      actual,
      items: [{ name: "Lavabo", quantity: 1, purchase_price: 0 }],
      employees: [{ total_cost: 100 }],
      teams: [],
    });
    expect(quality.status).toBe("partial");
    expect(quality.canShowMargin).toBe(true);
    expect(quality.issues[0]).toMatchObject({ code: "items_without_cost", count: 1 });
  });

  it("marca come parziale il margine quando un prelievo non ha costo unitario", () => {
    const actual = canonicalOrderEconomics({
      preventivo_totale: 1000,
      costo_materiali_magazzino: 250,
      movimenti_magazzino_senza_costo: 2,
      consuntivo: 250,
      margine: 750,
      margine_perc: 75,
    });
    const quality = assessOrderEconomicsQuality({ sourceAvailable: true, actual, items: [], employees: [], teams: [] });
    expect(quality.status).toBe("partial");
    expect(quality.issues).toContainEqual(expect.objectContaining({ code: "warehouse_movements_without_cost", count: 2 }));
  });

  it("separa la stima mezzi dal consuntivo ufficiale", () => {
    expect(orderVehicleCostEstimate({
      costo_mezzi_stimato: 345.67,
      mezzi_usati: 2,
      giorni_mezzo: 18,
      mezzi_senza_costo: 1,
      dati_mezzi_visibili: true,
    })).toEqual({
      estimatedCost: 345.67,
      vehiclesUsed: 2,
      vehicleDays: 18,
      vehiclesWithoutCost: 1,
      dataVisible: true,
    });
  });
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
