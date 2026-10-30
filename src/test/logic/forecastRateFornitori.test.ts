import { describe, expect, it } from "vitest";
import {
  buildForecastLedger,
  emptyForecastSources,
  type SupplierInstallmentRow,
} from "@/lib/finance/forecastLedger";

const today = "2026-10-29";

// La fattura Centrufficio di renova: 3.080,98 € imponibile al 22%, pagata con
// quattro RiBa da 939,70 € (lordo) il 31/10, 30/11, 10/01 e 31/01.
const costoCentrufficio = () => ({
  id: "cost-centrufficio",
  name: "Fattura 26VIT11181 - Centrufficio S.p.A.",
  amount: 3080.98,
  vat_rate: 22,
  due_date: "2026-10-31",
  is_paid: false,
  category: "materiali",
});
const riba = (numero: number, scadenza: string, stato = "da_pagare"): SupplierInstallmentRow => ({
  id: `r${numero}`,
  company_cost_id: "cost-centrufficio",
  numero,
  scadenza,
  importo: 939.7,
  metodo: "riba",
  stato,
});
const QUATTRO = [
  riba(1, "2026-10-31"),
  riba(2, "2026-11-30"),
  riba(3, "2027-01-10"),
  riba(4, "2027-01-31"),
];

describe("Il previsionale legge le rate dei fornitori", () => {
  it("una fattura a 4 RiBa esce in 4 mesi, non tutta alla prima", () => {
    const s = emptyForecastSources();
    s.costs = [costoCentrufficio()];
    s.supplierInstallments = QUATTRO;
    const uscite = buildForecastLedger(s, today).movements.filter((m) => m.direction === "out");
    expect(uscite.map((m) => m.date)).toEqual(["2026-10-31", "2026-11-30", "2027-01-10", "2027-01-31"]);
    expect(uscite.every((m) => m.cents === 93970)).toBe(true);
    expect(uscite[0].description).toBe("Fattura 26VIT11181 - Centrufficio S.p.A. · RiBa 1 di 4");
    expect(uscite[0].source).toBe("RiBa fornitore");
  });

  it("il totale non cambia: quattro RiBa fanno il lordo del costo", () => {
    const s = emptyForecastSources();
    s.costs = [costoCentrufficio()];
    s.supplierInstallments = QUATTRO;
    const conRate = buildForecastLedger(s, today).movements.reduce((t, m) => t + m.cents, 0);
    const senza = emptyForecastSources();
    senza.costs = [costoCentrufficio()];
    const unaSola = buildForecastLedger(senza, today).movements.reduce((t, m) => t + m.cents, 0);
    expect(conRate).toBe(375880);
    expect(unaSola).toBe(375880);
  });

  it("le RiBa già pagate non escono più dalla cassa", () => {
    const s = emptyForecastSources();
    s.costs = [costoCentrufficio()];
    s.supplierInstallments = [
      riba(1, "2026-10-31", "pagata"),
      riba(2, "2026-11-30"),
      riba(3, "2027-01-10"),
      riba(4, "2027-01-31"),
    ];
    const uscite = buildForecastLedger(s, today).movements.filter((m) => m.direction === "out");
    expect(uscite).toHaveLength(3);
    expect(uscite.map((m) => m.description)).toEqual([
      "Fattura 26VIT11181 - Centrufficio S.p.A. · RiBa 2 di 4",
      "Fattura 26VIT11181 - Centrufficio S.p.A. · RiBa 3 di 4",
      "Fattura 26VIT11181 - Centrufficio S.p.A. · RiBa 4 di 4",
    ]);
  });

  it("lo stato registrato si legge accanto all'uscita", () => {
    const s = emptyForecastSources();
    s.costs = [costoCentrufficio()];
    s.supplierInstallments = [
      riba(1, "2026-10-31", "avvisata"),
      riba(2, "2026-11-30", "da_bloccare"),
      riba(3, "2027-01-10", "richiamata"),
      riba(4, "2027-01-31", "insoluta"),
    ];
    const [a, b, c, d] = buildForecastLedger(s, today).movements.filter((m) => m.direction === "out");
    expect(a.note).toMatch(/avvisata/);
    expect(b.note).toMatch(/Da bloccare/);
    expect(c.note).toMatch(/Richiamata/);
    expect(c.estimated).toBe(true);
    expect(d.note).toMatch(/Insoluta/);
  });

  it("una rata senza importo prende la sua parte del lordo del costo", () => {
    const s = emptyForecastSources();
    s.costs = [costoCentrufficio()];
    s.supplierInstallments = [
      { ...riba(1, "2026-10-31"), importo: null },
      { ...riba(2, "2026-11-30"), importo: null },
    ];
    const uscite = buildForecastLedger(s, today).movements.filter((m) => m.direction === "out");
    expect(uscite.map((m) => m.cents)).toEqual([187940, 187940]);
    expect(uscite.every((m) => m.estimated)).toBe(true);
  });

  it("una rata senza data resta senza data, come una spesa senza scadenza", () => {
    const s = emptyForecastSources();
    s.costs = [{ ...costoCentrufficio(), due_date: "9999-12-31" }];
    s.supplierInstallments = [{ ...riba(1, "2026-10-31"), scadenza: null }];
    const [u] = buildForecastLedger(s, today).movements.filter((m) => m.direction === "out");
    expect(u.date).toBe(buildForecastLedger(
      Object.assign(emptyForecastSources(), { costs: [{ ...costoCentrufficio(), due_date: "9999-12-31" }] }),
      today,
    ).movements[0].date);
  });

  it("un costo senza rate esce come prima, una volta alla sua scadenza", () => {
    const s = emptyForecastSources();
    s.costs = [costoCentrufficio()];
    const uscite = buildForecastLedger(s, today).movements.filter((m) => m.direction === "out");
    expect(uscite).toHaveLength(1);
    expect(uscite[0].id).toBe("costo:cost-centrufficio");
    expect(uscite[0].date).toBe("2026-10-31");
  });

  it("le rate di un costo già pagato non esistono per il previsionale", () => {
    const s = emptyForecastSources();
    s.costs = [{ ...costoCentrufficio(), is_paid: true }];
    s.supplierInstallments = QUATTRO;
    expect(buildForecastLedger(s, today).movements.filter((m) => m.direction === "out")).toHaveLength(0);
  });
});
