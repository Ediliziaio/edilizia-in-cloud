import { describe, expect, it } from "vitest";
import { cashFlowMensile, vociManualiComeMovimenti } from "@/lib/controlloGestione/cashFlowMensile";
import { projectForecast, type ForecastMovement } from "@/lib/finance/forecastLedger";

const mov = (over: Partial<ForecastMovement>): ForecastMovement => ({
  id: "m", description: "Voce", counterparty: "", category: "clienti", direction: "in",
  cents: 10000, date: "2026-11-10", source: "Rate", href: "/", estimated: false, ...over,
});
const base = { companyId: "demo", anno: 2026, today: "2026-10-22", openingCents: 100000, openingSource: "banca" as const, openingUpdatedAt: null, manuali: [] };

describe("cash flow mensile del CdG = Previsionale raggruppato per mese", () => {
  it("parte dal saldo di oggi e mostra solo i mesi da quello in corso a dicembre", () => {
    const cf = cashFlowMensile({ ...base, movements: [mov({}), mov({ id: "f", category: "fornitori", direction: "out", cents: 3000, date: "2026-12-05" })] });
    expect(cf.mesi.map((m) => m.mese)).toEqual([10, 11, 12]);
    expect(cf.meta.saldo_apertura).toBe(1000);
    expect(cf.mesi[1].entrate.clienti).toBe(100);
    expect(cf.mesi[2].uscite.fornitori).toBe(30);
    expect(cf.meta.saldo_chiusura).toBe(1070);
  });

  it("tiene fuori dal saldo incassi e uscite già scaduti, come la pagina Previsionale", () => {
    const movements = [
      mov({ id: "scaduto", date: "2026-09-01", cents: 500000 }),
      mov({ id: "uscita-scaduta", direction: "out", category: "fornitori", date: "2026-09-15", cents: 2000 }),
    ];
    const cf = cashFlowMensile({ ...base, movements });
    expect(cf.meta.saldo_chiusura).toBe(1000);
    expect(cf.esclusi.incassi_scaduti).toEqual({ importo: 5000, numero: 1 });
    expect(cf.esclusi.uscite_scadute).toEqual({ importo: -20, numero: 1 });
  });

  it("dà lo stesso saldo a fine periodo di projectForecast con le ipotesi della pagina", () => {
    const movements = [mov({}), mov({ id: "p", category: "personale", direction: "out", cents: 40000, date: "2026-10-27" }), mov({ id: "nd", date: null })];
    const cf = cashFlowMensile({ ...base, movements });
    const p = projectForecast(movements, 100000, "2026-10-22", 71, 0, { delayDays: 0, includeEstimates: true, includeOverdueIncome: false, includeOverdueExpense: false });
    expect(cf.meta.saldo_chiusura * 100).toBe(p.finalBalance);
    expect(cf.esclusi.senza_data.numero).toBe(1);
  });

  it("aggiunge le voci manuali in una riga a parte e ne dichiara il totale", () => {
    const cf = cashFlowMensile({ ...base, movements: [], manuali: [{ id: "v", anno: 2026, mese: 11, tipo: "uscita", descrizione: "Dividendo", importo: "250", ricorrente: false }] });
    expect(cf.mesi[1].uscite.manuali).toBe(250);
    expect(cf.meta.manuali_netto).toBe(-250);
    expect(cf.meta.saldo_chiusura).toBe(750);
  });

  it("le voci manuali ricorrenti partono dal loro mese, saltano i mesi passati e cadono oggi se il 28 è passato", () => {
    const m = vociManualiComeMovimenti([{ id: "r", anno: 2026, mese: 9, tipo: "entrata", descrizione: "Socio", importo: 10, ricorrente: true }], "2026-10-29", 2026);
    expect(m.map((x) => x.date)).toEqual(["2026-10-29", "2026-11-28", "2026-12-28"]);
    expect(vociManualiComeMovimenti([{ id: "x", anno: 2026, mese: 13, tipo: "entrata", descrizione: "", importo: 10, ricorrente: false }], "2026-10-01", 2026)).toEqual([]);
  });

  it("per un anno futuro riporta il saldo a gennaio con i movimenti dei mesi prima", () => {
    const cf = cashFlowMensile({ ...base, anno: 2027, movements: [mov({ date: "2026-12-01" }), mov({ id: "b", date: "2027-02-01" })] });
    expect(cf.mesi[0].mese).toBe(1);
    expect(cf.meta.saldo_apertura).toBe(1100);
    expect(cf.meta.saldo_chiusura).toBe(1200);
  });

  it("rifiuta gli anni passati", () => {
    expect(() => cashFlowMensile({ ...base, anno: 2025, movements: [] })).toThrow(/corrente/);
  });
});
