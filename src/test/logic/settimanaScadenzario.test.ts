import { describe, expect, it } from "vitest";
import { calcolaRiepilogo } from "@/lib/finance/riepilogoPeriodoScadenzario";
import { filtriSettimana, saldoNettoAtteso } from "@/lib/finance/settimanaScadenzario";

const riga = (direction: string, amount: number, paid: number, status: string, due: string) => ({ direction, amount, paid_amount: paid, status, due_date: due });

describe("Saldo netto atteso e settimana", () => {
  const righe = [
    riga("entrata", 1000, 0, "da_pagare", "2026-11-30"),
    riga("entrata", 500, 200, "parziale", "2026-11-10"),   // scaduta: sta nell'aperto, come nel riquadro
    riga("entrata", 300, 300, "pagata", "2026-11-05"),
    riga("uscita", 400, 0, "da_pagare", "2026-11-29"),
    riga("uscita", 900, 0, "annullata", "2026-11-29"),     // le annullate non contano
  ];
  it("il saldo è da incassare meno da pagare, sulle stesse righe del riquadro «Aperto»", () => {
    const r = calcolaRiepilogo(righe, { oggi: "2026-11-28" });
    expect(r.entrate.aperto.importo).toBe(1300);
    expect(r.uscite.aperto.importo).toBe(400);
    expect(saldoNettoAtteso(r)).toBe(900);
  });
  it("la settimana va da oggi a domenica, solo aperte, senza senza-data", () => {
    const f = filtriSettimana({ dateFrom: "2026-01-01", dateTo: "2026-12-31", includiSenzaData: true, supplierId: "f1" } as never, "2026-11-28");
    expect(f.dateFrom).toBe("2026-11-28");
    expect(f.dateTo).toBe("2026-11-29");
    expect(f.soloAperte).toBe(true);
    expect(f.includiSenzaData).toBe(false);
    expect(f.supplierId).toBe("f1");
  });
});
