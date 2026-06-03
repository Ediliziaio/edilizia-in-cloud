import { describe, it, expect } from "vitest";
import {
  calcolaLCOE,
  applicaFinanziamento,
  calcolaCassaCumulata,
  type InputCassaCumulata,
  type InputLCOE,
} from "@/lib/fotovoltaico/finanziaria";

/**
 * Test delle estensioni del motore finanziario FV:
 *  - calcolaLCOE (costo livellato dell'energia)
 *  - applicaFinanziamento (finanziamento dentro il cashflow)
 * Esercitano il CODICE DI PRODUZIONE (src/lib/fotovoltaico/finanziaria.ts).
 */

const lcoeInput = (over: Partial<InputLCOE> = {}): InputLCOE => ({
  investimento_iniziale: 12000,
  produzione_anno_1_kwh: 8400,
  degradazione_pannelli_pct: 0.005,
  costo_manutenzione_anno_eur: 48,
  costo_sostituzione_inverter_eur: 1500,
  anno_sostituzione_inverter: 12,
  orizzonte_anni: 25,
  tasso_sconto: 0.04,
  ...over,
});

describe("calcolaLCOE — costo livellato dell'energia", () => {
  it("ritorna un €/kWh plausibile per un impianto residenziale tipico", () => {
    const lcoe = calcolaLCOE(lcoeInput());
    expect(lcoe).toBeGreaterThan(0.02);
    expect(lcoe).toBeLessThan(0.2);
  });

  it("più produzione ⇒ LCOE più basso", () => {
    const basso = calcolaLCOE(lcoeInput({ produzione_anno_1_kwh: 8400 }));
    const alto = calcolaLCOE(lcoeInput({ produzione_anno_1_kwh: 12000 }));
    expect(alto).toBeLessThan(basso);
  });

  it("investimento più alto ⇒ LCOE più alto", () => {
    const a = calcolaLCOE(lcoeInput({ investimento_iniziale: 12000 }));
    const b = calcolaLCOE(lcoeInput({ investimento_iniziale: 18000 }));
    expect(b).toBeGreaterThan(a);
  });

  it("produzione nulla ⇒ 0 (niente divisione per zero)", () => {
    expect(calcolaLCOE(lcoeInput({ produzione_anno_1_kwh: 0 }))).toBe(0);
  });
});

const cassaInput = (over: Partial<InputCassaCumulata> = {}): InputCassaCumulata => ({
  investimento_iniziale: 12000,
  produzione_anno_1_kwh: 8400,
  autoconsumo_pct: 0.5,
  costo_kwh_attuale: 0.32,
  prezzo_rid_kwh: 0.1,
  detrazione_annua_eur: 600,
  durata_detrazione_anni: 10,
  inflazione_energia_pct: 0.025,
  inflazione_rid_pct: 0.02,
  degradazione_pannelli_pct: 0.005,
  costo_manutenzione_anno_eur: 48,
  costo_sostituzione_inverter_eur: 1500,
  anno_sostituzione_inverter: 12,
  orizzonte_anni: 25,
  ...over,
});

describe("applicaFinanziamento — finanziamento dentro il cashflow", () => {
  it("anno 0: niente esborso pieno, solo l'anticipo", () => {
    const cash = calcolaCassaCumulata(cassaInput());
    const fin = applicaFinanziamento(cash, { rata_mensile_eur: 180, durata_mesi: 84 });
    expect(fin[0].flusso).toBe(0); // anticipo default 0
    const fin2 = applicaFinanziamento(cash, {
      anticipo_eur: 2000,
      rata_mensile_eur: 160,
      durata_mesi: 84,
    });
    expect(fin2[0].flusso).toBe(-2000);
  });

  it("durante il prestito sottrae le rate; dopo il prestito i flussi tornano pieni", () => {
    const cash = calcolaCassaCumulata(cassaInput());
    const fin = applicaFinanziamento(cash, { rata_mensile_eur: 200, durata_mesi: 18 });
    // anno 1 (12 mesi di rata) e anno 2 (6 mesi) sono ridotti
    expect(fin[1].flusso).toBeCloseTo(cash[1].flusso - 200 * 12, 1);
    expect(fin[2].flusso).toBeCloseTo(cash[2].flusso - 200 * 6, 1);
    // anno 3 = nessuna rata residua ⇒ flusso pieno
    expect(fin[3].flusso).toBe(cash[3].flusso);
  });

  it("il guadagno finale finanziato = cash − interessi totali (rata×durata + anticipo − investimento)", () => {
    const inv = 12000;
    const rata = 180;
    const durata = 84;
    const anticipo = 1000;
    const cash = calcolaCassaCumulata(cassaInput({ investimento_iniziale: inv }));
    const fin = applicaFinanziamento(cash, {
      anticipo_eur: anticipo,
      rata_mensile_eur: rata,
      durata_mesi: durata,
    });
    const interessi = rata * durata + anticipo - inv;
    const cashFinale = cash[cash.length - 1].cumulato;
    const finFinale = fin[fin.length - 1].cumulato;
    expect(Math.abs(finFinale - (cashFinale - interessi))).toBeLessThan(1);
  });
});
