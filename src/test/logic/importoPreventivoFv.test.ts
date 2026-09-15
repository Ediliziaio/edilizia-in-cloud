import { describe, expect, it } from "vitest";
import {
  aliquotaIvaFv,
  importoPreventivoFv,
  ivaSuggeritaPerTipologia,
  mancaPrezzoDiVendita,
  percentualeIvaFv,
} from "@/lib/fotovoltaico/importoPreventivo";
import { calcolaFvEconomicsGuard } from "@/lib/fotovoltaico/preventivatore";

describe("IVA del preventivo fotovoltaico", () => {
  it("legge frazioni e percentuali, e lo 0 resta 0", () => {
    expect(aliquotaIvaFv("0.1000")).toBe(0.1);
    expect(aliquotaIvaFv(22)).toBe(0.22);
    expect(aliquotaIvaFv(0)).toBe(0);
    expect(aliquotaIvaFv(null)).toBe(0.1);
    expect(aliquotaIvaFv("abc")).toBe(0.1);
    expect(percentualeIvaFv(0.22)).toBe(22);
    expect(percentualeIvaFv(undefined)).toBe(10);
  });

  it("parte dal tipo di immobile", () => {
    expect(ivaSuggeritaPerTipologia("residenziale")).toBe(0.1);
    expect(ivaSuggeritaPerTipologia("capannone")).toBe(0.22);
  });
});

describe("Importo in elenco e scheda", () => {
  it("una bozza col prezzo a corpo non ricalcolata non mostra 0 €", () => {
    expect(
      importoPreventivoFv({ prezzo_vendita_iva_inclusa: 0, prezzo_vendita_manuale: 18000, iva_aliquota: 0.1 }),
    ).toBe(19800);
  });

  it("il prezzo a corpo segue l'IVA scelta", () => {
    expect(
      importoPreventivoFv({ prezzo_vendita_iva_inclusa: 11000, prezzo_vendita_manuale: 10000, iva_aliquota: 0.22 }),
    ).toBe(12200);
  });

  it("un kit ricalcolato usa il totale del calcolo (che conosce lo sconto)", () => {
    expect(
      importoPreventivoFv({ prezzo_vendita_iva_inclusa: 9900, kit_bundle_id: "k", kit_prezzo: 10000, iva_aliquota: 0.1 }),
    ).toBe(9900);
  });

  it("un kit mai ricalcolato usa il prezzo del kit", () => {
    expect(
      importoPreventivoFv({ prezzo_vendita_iva_inclusa: null, kit_bundle_id: "k", kit_prezzo: 10000, iva_aliquota: 0.1 }),
    ).toBe(11000);
  });

  it("senza nessun prezzo resta vuoto", () => {
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: null })).toBeNull();
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: 0 })).toBe(0);
  });
});

describe("Emissione senza prezzo di vendita", () => {
  it("si chiede quando componenti a 0 €, niente kit e niente prezzo a corpo", () => {
    expect(mancaPrezzoDiVendita({ costo_componenti_vendita: 0 })).toBe(true);
  });

  it("non si chiede col prezzo a corpo, con un kit o coi prezzi del listino", () => {
    expect(mancaPrezzoDiVendita({ costo_componenti_vendita: 0, prezzo_vendita_manuale: 15000 })).toBe(false);
    expect(mancaPrezzoDiVendita({ costo_componenti_vendita: 0, kit_bundle_id: "k" })).toBe(false);
    expect(mancaPrezzoDiVendita({ costo_componenti_vendita: 4200 })).toBe(false);
    expect(mancaPrezzoDiVendita({ costo_componenti_vendita: null })).toBe(false);
  });
});

describe("Controllo economico senza costi d'acquisto", () => {
  it("col prezzo a corpo e senza costi non blocca e non inventa il margine", () => {
    const guard = calcolaFvEconomicsGuard({
      prezzo_vendita_netto: 15000,
      costo_totale_netto: 0,
      margine_eur: 15000,
      margine_pct: 1,
      margine_target_pct: 0.35,
      cpl_max_sostenibile: 120,
      payback_anni: 8,
    });
    expect(guard.issues.find((i) => i.level === "critical")).toBeUndefined();
    expect(guard.metrics.margine_eur).toBeNull();
    expect(guard.metrics.margine_pct).toBeNull();
  });

  it("costi incompleti: il margine resta vuoto anche se il calcolo ne dà uno", () => {
    const guard = calcolaFvEconomicsGuard({
      prezzo_vendita_netto: 15000,
      costo_totale_netto: 900,
      costi_incompleti: true,
      margine_target_pct: 0.35,
      cpl_max_sostenibile: 120,
    });
    expect(guard.metrics.margine_pct).toBeNull();
    expect(guard.issues.some((i) => i.code === "margin_below_target")).toBe(false);
  });

  it("senza prezzo di vendita resta un problema critico", () => {
    const guard = calcolaFvEconomicsGuard({ prezzo_vendita_netto: 0, costo_totale_netto: 0 });
    expect(guard.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "missing_costs", level: "critical" })]),
    );
  });
});
