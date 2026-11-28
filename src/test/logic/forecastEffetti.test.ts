import { describe, expect, it } from "vitest";
import { buildForecastLedger, emptyForecastSources, type EffettoRow } from "@/lib/finance/forecastLedger";

const today = "2026-11-28";
const costo = () => ({ id: "c1", name: "Fattura Rossi", amount: 1000, vat_rate: 22, due_date: "2026-12-05", is_paid: false, category: "materiali" });
const effetto = (o: Partial<EffettoRow> = {}): EffettoRow => ({
  id: "e1", tipo: "assegno", direzione: "emesso", numero: "12", importo: 1220, data_scadenza: "2027-01-15",
  stato: "in_attesa", company_cost_id: "c1", ...o,
});
const totale = (m: { cents: number }[]) => m.reduce((n, x) => n + x.cents, 0);

describe("Il previsionale sposta l'uscita alla data dell'assegno", () => {
  it("l'uscita passa dalla scadenza alla data dell'assegno e il totale non cambia", () => {
    const base = emptyForecastSources();
    base.costs = [costo()];
    const prima = buildForecastLedger(base, today).movements;
    expect(prima.map((m) => m.date)).toEqual(["2026-12-05"]);

    const s = emptyForecastSources();
    s.costs = [costo()];
    s.effetti = [effetto()];
    const dopo = buildForecastLedger(s, today).movements;
    expect(dopo).toHaveLength(1);
    expect(dopo[0].id).toBe("effetto:e1");
    expect(dopo[0].date).toBe("2027-01-15");
    expect(dopo[0].source).toBe("Assegni ed effetti");
    expect(dopo[0].direction).toBe("out");
    expect(totale(dopo)).toBe(totale(prima));
  });

  it("un assegno per una parte: la parte esce alla sua data, il resto alla scadenza, totale invariato", () => {
    const base = emptyForecastSources();
    base.costs = [costo()];
    const prima = buildForecastLedger(base, today).movements;
    const s = emptyForecastSources();
    s.costs = [costo()];
    s.effetti = [effetto({ importo: 500 })];
    const dopo = buildForecastLedger(s, today).movements;
    expect(dopo.map((m) => [m.date, m.cents])).toEqual([["2026-12-05", 72000], ["2027-01-15", 50000]]);
    expect(totale(dopo)).toBe(totale(prima));
  });

  it("data già passata e ancora in attesa: va a oggi, «da confermare»", () => {
    const s = emptyForecastSources();
    s.costs = [costo()];
    s.effetti = [effetto({ data_scadenza: "2026-11-20" })];
    const [m] = buildForecastLedger(s, today).movements;
    expect(m.date).toBe(today);
    expect(m.note).toMatch(/da confermare/i);
  });

  it("gli effetti già chiusi o annullati non spostano niente", () => {
    const s = emptyForecastSources();
    s.costs = [costo()];
    s.effetti = [effetto({ stato: "pagato" }), effetto({ id: "e2", stato: "annullato" })];
    const m = buildForecastLedger(s, today).movements;
    expect(m.map((x) => x.id)).toEqual(["costo:c1"]);
  });

  it("un assegno ricevuto è un'entrata alla sua data", () => {
    const s = emptyForecastSources();
    s.effetti = [effetto({ direzione: "ricevuto", company_cost_id: null, importo: 800 })];
    const [m] = buildForecastLedger(s, today).movements;
    expect(m.direction).toBe("in");
    expect(m.cents).toBe(80000);
  });
});
