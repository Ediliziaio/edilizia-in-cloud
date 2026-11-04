/**
 * Dove si vede il debito dopo una nota di credito: partitario del fornitore, ODA, previsionale.
 * Una rata «stornata» non è pagata e non è da pagare; una rata ridotta vale il nuovo importo.
 */
import { describe, expect, it } from "vitest";
import { estrattoConto, statoFatture, totaliFornitore, type FatturaFornitore, type RataFornitore } from "@/lib/fornitori/estrattoConto";
import { buildForecastLedger, emptyForecastSources } from "@/lib/finance/forecastLedger";

const OGGI = "2026-11-04";
const fattura: FatturaFornitore = {
  id: "fa", numero_fattura: "A", data_fattura: "2026-10-01", tipo_documento: "TD01", totale_documento: 122, netto_a_pagare: 122,
  stato: "contabilizzata", company_cost_id: "c1",
};
const nota = (totale: number, netto: number | null = totale): FatturaFornitore => ({
  id: "n", numero_fattura: "NC", data_fattura: "2026-10-05", tipo_documento: "TD04", totale_documento: totale, netto_a_pagare: netto,
  stato: "contabilizzata", company_cost_id: "c1",
});
const rata = (numero: number, importo: number, stato: string, extra: Partial<RataFornitore> = {}): RataFornitore => ({
  id: `r${numero}`, fattura_ricevuta_id: "fa", company_cost_id: "c1", numero, scadenza: "2026-12-31", importo, metodo: "riba", stato, pagata_il: null, ...extra,
});

describe("il partitario dopo una nota di credito", () => {
  it("storno parziale: resta da pagare la rata ridotta, e non è «pagata»", () => {
    const righe = statoFatture([fattura, nota(61)], [rata(1, 0, "stornata"), rata(2, 61, "da_pagare")], OGGI);
    expect(righe[0]).toMatchObject({ stato: "da_pagare", pagato: 0, residuo: 61, prossimaScadenza: "2026-12-31" });
    expect(totaliFornitore(righe, OGGI)).toMatchObject({ fatturato: 122, pagato: 0, daPagare: 61, noteCredito: 61 });
    expect(estrattoConto(righe).at(-1)?.saldo).toBe(61);
  });

  it("storno totale: la fattura è stornata, senza residuo e senza un pagamento inventato", () => {
    const righe = statoFatture([fattura, nota(122)], [rata(1, 0, "stornata"), rata(2, 0, "stornata")], OGGI);
    expect(righe[0]).toMatchObject({ stato: "stornata", pagato: 0, residuo: 0, prossimaScadenza: null });
    const conto = estrattoConto(righe);
    expect(conto.some((m) => m.descrizione.startsWith("Pagamento"))).toBe(false);
    expect(conto.at(-1)?.saldo).toBe(0);
  });

  it("prima rata pagata, seconda chiusa dalla nota: è pagata, e il saldo torna a zero", () => {
    const righe = statoFatture([fattura, nota(62)], [rata(1, 60, "pagata", { pagata_il: "2026-10-10" }), rata(2, 0, "stornata")], OGGI);
    expect(righe[0]).toMatchObject({ stato: "pagata", pagato: 60, residuo: 0 });
    expect(estrattoConto(righe).at(-1)?.saldo).toBe(0);
  });

  it("una rata stornata con la data passata non è scaduta", () => {
    const righe = statoFatture([fattura], [rata(1, 0, "stornata", { scadenza: "2026-01-01" }), rata(2, 122, "da_pagare")], OGGI);
    expect(righe[0].stato).toBe("da_pagare");
    expect(totaliFornitore(righe, OGGI).scaduto).toBe(0);
  });

  it.each([
    ["positiva", 61, 61],
    ["negativa", -61, -61],
    ["col netto a zero", 61, 0],
    ["col netto di segno opposto", 494.1, -494.1],
  ])("nota %s: nel partitario il debito scende sempre", (_nome, totale, netto) => {
    const righe = statoFatture([fattura, nota(totale, netto)], [rata(1, 122, "da_pagare")], OGGI);
    const conto = estrattoConto(righe);
    expect(conto.find((m) => m.fatturaId === "n")?.dare).toBe(Math.abs(totale));
    expect(conto.at(-1)?.saldo).toBe(122 - Math.abs(totale));
  });

  it("senza note resta il conto di prima anche con le rate senza importo", () => {
    const righe = statoFatture([fattura], [{ ...rata(1, 0, "da_pagare"), importo: null }], OGGI);
    expect(righe[0].residuo).toBe(122);
  });
});

describe("il previsionale dopo una nota di credito", () => {
  const costo = { id: "c1", name: "Fattura A", amount: 50, vat_rate: 22, is_paid: false, due_date: "2027-01-31", paid_date: null, recurrence: "once" };
  const rataP = (numero: number, importo: number, stato: string, scadenza: string) =>
    ({ id: `r${numero}`, company_cost_id: "c1", numero, scadenza, importo, metodo: "riba", stato });
  const uscite = (rate: ReturnType<typeof rataP>[]) => {
    const s = emptyForecastSources();
    s.costs = [costo as never];
    s.supplierInstallments = rate;
    return buildForecastLedger(s, "2026-11-04").movements.filter((m) => m.direction === "out" && m.id.startsWith("rata-fornitore:"));
  };

  it("esce la rata ridotta, col nuovo importo; quella stornata non esce", () => {
    const u = uscite([rataP(1, 0, "stornata", "2026-12-31"), rataP(2, 61, "da_pagare", "2027-01-31")]);
    expect(u.map((m) => [m.id, m.date, m.cents])).toEqual([["rata-fornitore:r2", "2027-01-31", 6100]]);
  });

  it("anche una rata ridotta ma non azzerata esce per quello che resta", () => {
    const u = uscite([rataP(1, 30, "da_pagare", "2026-12-31"), rataP(2, 62, "da_pagare", "2027-01-31")]);
    expect(u.map((m) => m.cents)).toEqual([3000, 6200]);
  });
});
