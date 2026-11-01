import { describe, expect, it } from "vitest";
import { buildForecastLedger, emptyForecastSources, type PayrollRow } from "@/lib/finance/forecastLedger";

const oggi = "2026-11-01";
const cedolino = (patch: Partial<PayrollRow> = {}): PayrollRow => ({
  id: "c1", employee_id: "e1", anno: 2026, mese: 10, netto: 1500, stato: "emesso", data_pagamento: "2026-11-10",
  ritenute_irpef: 300, contributi_dipendente: 150, contributi_datore: 450, ...patch,
});
const ids = (s: ReturnType<typeof emptyForecastSources>) => buildForecastLedger(s, oggi).movements;

describe("previsionale: F24 dei dipendenti e mutui (01/11/2026)", () => {
  it("ritenute 1001 e contributi INPS dei cedolini escono il 16 del mese dopo lo stipendio", () => {
    const s = emptyForecastSources();
    s.payroll = [cedolino(), cedolino({ id: "c2", employee_id: "e2", ritenute_irpef: 200, contributi_dipendente: 100, contributi_datore: 300 })];
    const m = ids(s);
    expect(m.find((x) => x.id === "f24-1001:2026-11")).toMatchObject({ cents: 50000, date: "2026-12-16", estimated: true });
    expect(m.find((x) => x.id === "f24-inps:2026-11")).toMatchObject({ cents: 100000, date: "2026-12-16" });
  });

  it("l'F24 1001 registrato di quel mese toglie la stima delle ritenute, non quella dei contributi", () => {
    const s = emptyForecastSources();
    s.payroll = [cedolino()];
    s.f24Ritenute = [{ anno: 2026, mese: 11, tributo_code: "1001", stato: "da_pagare" }];
    const m = ids(s);
    expect(m.find((x) => x.id === "f24-1001:2026-11")).toBeUndefined();
    expect(m.find((x) => x.id === "f24-inps:2026-11")).toBeDefined();
  });

  it("un F24 di un mese già scaduto non si stima", () => {
    const s = emptyForecastSources();
    s.payroll = [cedolino({ data_pagamento: "2026-09-10" })];
    expect(ids(s).filter((x) => x.id.startsWith("f24-"))).toHaveLength(0);
  });

  it("le rate del mutuo entrano nel previsionale, capitale e interessi", () => {
    const s = emptyForecastSources();
    s.loans = [{ id: "l1", banca: "Intesa", descrizione: "Mutuo capannone", capitale_residuo: 2500, tasso_pct: 0, rata_mensile: 1000, data_inizio: "2024-01-05", data_fine: null }];
    const m = ids(s).filter((x) => x.id.startsWith("mutuo:l1"));
    expect(m.map((x) => [x.date, x.cents])).toEqual([["2026-11-05", 100000], ["2026-12-05", 100000], ["2027-01-05", 50000]]);
  });
});
