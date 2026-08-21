import { describe, expect, it } from "vitest";
import { buildCostsOverview, periodRange, periodLabel } from "@/components/costi/CostsOverviewTab";
import type { UnifiedCost } from "@/lib/costsUtils";

/**
 * Verifica funzionale della Panoramica Costi per periodo (mese/trimestre/anno),
 * introdotta il 12/7/2026: KPI, confronto col periodo precedente, ripartizione
 * per voce e trend 12 mesi con evidenziazione del periodo selezionato.
 */
function cost(partial: Partial<UnifiedCost> & { amount: number; due_date: string }): UnifiedCost {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Costo test",
    cost_type: "variable",
    category: "Fornitori",
    recurrence: "una_tantum",
    is_paid: false,
    paid_date: null,
    notes: null,
    order_id: null,
    order: null,
    isFromOrder: false,
    ...partial,
  } as UnifiedCost;
}

// Fixture: luglio 2026 selezionato
const LUGLIO = new Date(2026, 6, 15);
const FIXTURE: UnifiedCost[] = [
  // Luglio 2026 (mese selezionato)
  cost({ amount: 1000, due_date: "2026-07-05", category: "Personale", is_paid: true }),
  cost({ amount: 500,  due_date: "2026-07-20", category: "Fornitori" }),
  // Giugno 2026 (mese prec. / stesso trimestre? No: giu = Q2, lug = Q3)
  cost({ amount: 2000, due_date: "2026-06-10", category: "Personale" }),
  // Agosto 2026 (stesso trimestre Q3, mese diverso)
  cost({ amount: 300,  due_date: "2026-08-01", category: "Provvigioni" }),
  // Aprile 2026 (Q2 = trimestre precedente di Q3)
  cost({ amount: 700,  due_date: "2026-04-15", category: "Fornitori" }),
  // Anno precedente (2025)
  cost({ amount: 9000, due_date: "2025-07-15", category: "Personale" }),
  // Scadenza sentinella e nulla → sempre esclusi
  cost({ amount: 99999, due_date: "9999-12-31" }),
  cost({ amount: 88888, due_date: "" }),
];

describe("Panoramica Costi — periodi", () => {
  it("mese: totali, pagato e confronto col mese precedente", () => {
    const r = buildCostsOverview(FIXTURE, LUGLIO, "mese");
    expect(r.totalePeriodo).toBe(1500);           // 1000 + 500
    expect(r.pagatoPeriodo).toBe(1000);
    expect(r.daPagarePeriodo).toBe(500);
    expect(r.totalePrec).toBe(2000);              // giugno
  });

  it("trimestre: aggrega Q3 (lug+ago) e confronta con Q2 (apr+giu)", () => {
    const r = buildCostsOverview(FIXTURE, LUGLIO, "trimestre");
    expect(r.totalePeriodo).toBe(1800);           // 1000 + 500 + 300
    expect(r.totalePrec).toBe(2700);              // 2000 (giu) + 700 (apr)
  });

  it("anno: aggrega il 2026 e confronta col 2025", () => {
    const r = buildCostsOverview(FIXTURE, LUGLIO, "anno");
    expect(r.totalePeriodo).toBe(4500);           // tutti i 2026: 1000+500+2000+300+700
    expect(r.totalePrec).toBe(9000);              // 2025
  });

  it("le voci sono ordinate per importo e le categorie normalizzate", () => {
    const r = buildCostsOverview(FIXTURE, LUGLIO, "anno");
    expect(r.voci[0].nome).toBe("Personale");                 // 3000
    expect(r.voci[1].nome).toBe("Materiali & fornitori");     // Fornitori normalizzato, 1200
    expect(r.voci.map(v => v.nome)).toContain("Provvigioni");
  });

  it("trend: 12 mesi, totale = personale + altro, evidenzia il periodo selezionato", () => {
    const r = buildCostsOverview(FIXTURE, LUGLIO, "trimestre");
    expect(r.trend).toHaveLength(12);
    const lug = r.trend.find(t => t.key === "2026-07")!;
    expect(lug.personale).toBe(1000);
    expect(lug.altro).toBe(500);
    expect(lug.totale).toBe(1500);
    expect(lug.inPeriodo).toBe(true);             // luglio ∈ Q3
    const giu = r.trend.find(t => t.key === "2026-06")!;
    expect(giu.inPeriodo).toBe(false);            // giugno ∈ Q2
    // Con mode=anno anche giugno è nel periodo
    const anno = buildCostsOverview(FIXTURE, LUGLIO, "anno");
    expect(anno.trend.find(t => t.key === "2026-06")!.inPeriodo).toBe(true);
  });

  it("periodRange e periodLabel per le tre modalità", () => {
    expect(periodRange(LUGLIO, "mese").start.getMonth()).toBe(6);
    expect(periodRange(LUGLIO, "trimestre").start.getMonth()).toBe(6);  // Q3 = lug
    expect(periodRange(LUGLIO, "trimestre").end.getMonth()).toBe(8);    // set
    expect(periodRange(LUGLIO, "anno").start.getMonth()).toBe(0);
    expect(periodLabel(LUGLIO, "mese")).toBe("luglio");
    expect(periodLabel(LUGLIO, "trimestre")).toBe("3° trimestre");
    expect(periodLabel(LUGLIO, "anno")).toBe("2026");
  });

  it("scadenze sentinella (9999-12-31) e vuote restano fuori da tutto", () => {
    const r = buildCostsOverview(FIXTURE, LUGLIO, "anno");
    expect(r.totalePeriodo).toBeLessThan(80000);
    expect(r.trend.every(t => t.totale < 80000)).toBe(true);
  });

  it("ma i costi senza scadenza vengono DICHIARATI (conteggio + euro)", () => {
    const r = buildCostsOverview(FIXTURE, LUGLIO, "mese");
    expect(r.senzaScadenza.count).toBe(2);          // sentinella + vuota
    expect(r.senzaScadenza.totale).toBe(99999 + 88888);
  });
});
