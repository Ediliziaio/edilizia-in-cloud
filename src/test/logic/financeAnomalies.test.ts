import { describe, it, expect } from "vitest";
import {
  fmtEur,
  fuzzyMatch,
  computeMatchScore,
  detectReconAnomalies,
} from "@/lib/finance/reconciliationAnalysis";
import {
  detectCashAnomalies,
  type ForecastResult,
  type ForecastWeek,
} from "@/lib/finance/cashflowAnalysis";

/**
 * Test logica finanziaria estratta da BankReconciliation e SilvioCashflowForecast.
 * Esercita il CODICE DI PRODUZIONE (import da @/lib/finance/*), così la logica
 * money-adjacent è verificabile senza login né React/Supabase.
 *
 * Tutto in sola lettura: nessuna funzione qui muove denaro o scrive su DB.
 */

// ─── Helper costruttori (forecast) ──────────────────────────────────────────

function makeWeek(overrides: Partial<ForecastWeek> = {}): ForecastWeek {
  return {
    week_index: 1,
    week_start: "2026-06-01",
    week_end: "2026-06-07",
    incassi_eur: 1000,
    uscite_eur: 500,
    cashflow_netto_eur: 500,
    saldo_atteso_eur: 5000,
    status: "ok",
    ...overrides,
  };
}

function makeForecast(
  weeks: ForecastWeek[],
  delayPattern: ForecastResult["delay_pattern"] = {
    avg_delay_days_global: 0,
    delays_per_client: {},
  },
): ForecastResult {
  return {
    aggiornato_al: "2026-06-02T08:00:00Z",
    saldo_oggi_eur: 5000,
    orizzonte_settimane: weeks.length || 13,
    delay_pattern: delayPattern,
    costo_personale_mensile_netto_eur: 0,
    totale_incassi_previsti_eur: 0,
    totale_uscite_previste_eur: 0,
    saldo_atteso_fine_periodo_eur: weeks.length
      ? weeks[weeks.length - 1].saldo_atteso_eur
      : 5000,
    saldo_minimo_eur: 0,
    settimana_critica: "",
    critical_weeks_count: 0,
    warning_weeks_count: 0,
    weeks,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RICONCILIAZIONE — fmtEur
// ═══════════════════════════════════════════════════════════════════════════

describe("fmtEur", () => {
  it("formatta in valuta EUR con convenzioni it-IT", () => {
    const s = fmtEur(1000);
    // separatore migliaia opzionale: dipende dai dati ICU del runtime
    expect(s).toMatch(/1\.?000,00/);
    expect(s).toContain("€");
  });

  it("gestisce gli zero", () => {
    expect(fmtEur(0)).toContain("0,00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RICONCILIAZIONE — fuzzyMatch
// ═══════════════════════════════════════════════════════════════════════════

describe("fuzzyMatch", () => {
  it("ignora maiuscole/punteggiatura e riconosce l'inclusione", () => {
    expect(fuzzyMatch("Rossi Mario S.R.L.", "rossi mario")).toBe(true);
    expect(fuzzyMatch("mario", "Mario Rossi & C.")).toBe(true);
  });

  it("nomi diversi non combaciano", () => {
    expect(fuzzyMatch("ACME", "Globex")).toBe(false);
  });

  it("stringhe vuote → false", () => {
    expect(fuzzyMatch("", "qualcosa")).toBe(false);
    expect(fuzzyMatch("qualcosa", "")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RICONCILIAZIONE — computeMatchScore
// ═══════════════════════════════════════════════════════════════════════════

describe("computeMatchScore", () => {
  it("importo esatto vale 50 punti", () => {
    const m = computeMatchScore({ amount: 1000 }, { total: 1000, paid_amount: 0 });
    expect(m).not.toBeNull();
    expect(m!.score).toBe(50);
    expect(m!.reasons).toContain("Importo esatto");
  });

  it("usa il residuo (total - paid_amount) per il confronto importo", () => {
    const m = computeMatchScore({ amount: 400 }, { total: 1000, paid_amount: 600 });
    expect(m).not.toBeNull();
    expect(m!.reasons).toContain("Importo esatto");
  });

  it("sotto la soglia minima (score < 50) restituisce null", () => {
    // importi distanti, nessun IBAN, nessun nome → 0 punti
    const m = computeMatchScore({ amount: 1000 }, { total: 2000, paid_amount: 0 });
    expect(m).toBeNull();
  });

  it("importo simile (+35) da solo non basta, ma con nome (+20) supera la soglia", () => {
    const m = computeMatchScore(
      { amount: 1005, creditor_name: "Mario Rossi" },
      { total: 1000, paid_amount: 0, client_company_name: "Mario Rossi" },
    );
    expect(m).not.toBeNull();
    expect(m!.score).toBe(55);
    expect(m!.reasons.some((r) => r.startsWith("Importo simile"))).toBe(true);
    expect(m!.reasons).toContain("Nome cliente simile");
  });

  it("IBAN corrispondente aggiunge 30 punti (spazi/maiuscole normalizzati)", () => {
    const m = computeMatchScore(
      { amount: 1000, creditor_iban: "IT00 1234 5678" },
      { total: 1000, paid_amount: 0, bank_iban: "it0012345678" },
    );
    expect(m).not.toBeNull();
    expect(m!.score).toBe(80); // 50 esatto + 30 IBAN
    expect(m!.reasons).toContain("IBAN corrispondente");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RICONCILIAZIONE — detectReconAnomalies
// ═══════════════════════════════════════════════════════════════════════════

describe("detectReconAnomalies", () => {
  it("nessun dato → nessuna anomalia", () => {
    expect(detectReconAnomalies([], [])).toEqual([]);
  });

  it("rileva fatture scadute (per due_date passata) non incassate", () => {
    const out = detectReconAnomalies(
      [],
      [{ id: "i1", total: 1000, paid_amount: 0, due_date: "2020-01-01", status: "sent" }],
    );
    const overdue = out.find((a) => a.id === "overdue");
    expect(overdue).toBeTruthy();
    expect(overdue!.target).toBe("inv");
    expect(overdue!.severity).toBe("warning");
    expect(overdue!.ids).toEqual(["i1"]);
    expect(overdue!.detail).toMatch(/1\.?000,00/);
  });

  it("considera scaduta anche una fattura con status 'overdue' senza due_date", () => {
    const out = detectReconAnomalies(
      [],
      [{ id: "i2", total: 500, paid_amount: 0, due_date: null, status: "overdue" }],
    );
    expect(out.find((a) => a.id === "overdue")?.ids).toEqual(["i2"]);
  });

  it("esclude le fatture già pagate per intero (residuo <= 0)", () => {
    const out = detectReconAnomalies(
      [],
      [{ id: "i3", total: 1000, paid_amount: 1000, due_date: "2020-01-01", status: "sent" }],
    );
    expect(out.find((a) => a.id === "overdue")).toBeUndefined();
  });

  it("segnala accrediti senza fattura corrispondente (nomatch)", () => {
    const out = detectReconAnomalies(
      [{ id: "t1", amount: 1234.56, creditor_name: "Cliente X" }],
      [],
    );
    const nomatch = out.find((a) => a.id === "nomatch");
    expect(nomatch).toBeTruthy();
    expect(nomatch!.target).toBe("tx");
    expect(nomatch!.severity).toBe("info");
    expect(nomatch!.ids).toEqual(["t1"]);
  });

  it("segnala match ambiguo quando ≥2 fatture sono candidati forti (score ≥ 70)", () => {
    const out = detectReconAnomalies(
      [{ id: "t1", amount: 1000, creditor_name: "Mario Rossi" }],
      [
        { id: "i1", total: 1000, paid_amount: 0, client_company_name: "Mario Rossi", due_date: "2999-12-31", status: "sent" },
        { id: "i2", total: 1000, paid_amount: 0, client_company_name: "Mario Rossi", due_date: "2999-12-31", status: "sent" },
      ],
    );
    const ambiguous = out.find((a) => a.id === "ambiguous");
    expect(ambiguous).toBeTruthy();
    expect(ambiguous!.target).toBe("tx");
    expect(ambiguous!.severity).toBe("warning");
    expect(ambiguous!.ids).toEqual(["t1"]);
    // avendo un match, NON deve comparire come 'nomatch'
    expect(out.find((a) => a.id === "nomatch")).toBeUndefined();
  });

  it("rileva possibili pagamenti duplicati (stesso importo+intestatario entro 7gg)", () => {
    const out = detectReconAnomalies(
      [
        { id: "t1", amount: 1000, creditor_name: "Mario Rossi", booking_date: "2026-05-01" },
        { id: "t2", amount: 1000, creditor_name: "Mario Rossi", booking_date: "2026-05-03" },
      ],
      [],
    );
    const dup = out.find((a) => a.id === "duplicates");
    expect(dup).toBeTruthy();
    expect(dup!.severity).toBe("warning");
    expect(dup!.ids).toContain("t1");
    expect(dup!.ids).toContain("t2");
  });

  it("non segnala duplicati se le transazioni distano più di 7 giorni", () => {
    const out = detectReconAnomalies(
      [
        { id: "t1", amount: 1000, creditor_name: "Mario Rossi", booking_date: "2026-05-01" },
        { id: "t2", amount: 1000, creditor_name: "Mario Rossi", booking_date: "2026-05-20" },
      ],
      [],
    );
    expect(out.find((a) => a.id === "duplicates")).toBeUndefined();
  });

  it("scenario pulito (un match esatto, non scaduto) → nessuna anomalia", () => {
    const out = detectReconAnomalies(
      [{ id: "t1", amount: 1000, creditor_name: "Mario Rossi", booking_date: "2026-05-01" }],
      [{ id: "i1", total: 1000, paid_amount: 0, client_company_name: "Mario Rossi", due_date: "2999-12-31", status: "sent" }],
    );
    expect(out).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FORECAST — detectCashAnomalies
// ═══════════════════════════════════════════════════════════════════════════

describe("detectCashAnomalies", () => {
  it("rileva il saldo cumulato sotto zero (critical)", () => {
    const data = makeForecast([
      makeWeek({ week_index: 1, saldo_atteso_eur: 1000 }),
      makeWeek({ week_index: 3, saldo_atteso_eur: -200 }),
    ]);
    const neg = detectCashAnomalies(data).find((a) => a.id === "neg-balance");
    expect(neg).toBeTruthy();
    expect(neg!.severity).toBe("critical");
    expect(neg!.title).toContain("S3");
  });

  it("rileva il primo peggioramento di stato (ok → warning)", () => {
    const data = makeForecast([
      makeWeek({ week_index: 1, status: "ok" }),
      makeWeek({ week_index: 2, status: "warning" }),
    ]);
    const t = detectCashAnomalies(data).find((a) => a.id === "transition-2");
    expect(t).toBeTruthy();
    expect(t!.severity).toBe("warning");
  });

  it("il peggioramento verso 'critical' ha severità critical", () => {
    const data = makeForecast([
      makeWeek({ week_index: 1, status: "ok" }),
      makeWeek({ week_index: 2, status: "critical" }),
    ]);
    expect(detectCashAnomalies(data).find((a) => a.id === "transition-2")?.severity).toBe("critical");
  });

  it("rileva la concentrazione di uscite e sceglie la settimana peggiore", () => {
    const data = makeForecast([
      makeWeek({ week_index: 1, status: "ok" }),
      makeWeek({ week_index: 2, incassi_eur: 100, uscite_eur: 500, status: "warning" }),
      makeWeek({ week_index: 3, incassi_eur: 100, uscite_eur: 900, status: "warning" }),
    ]);
    const spike = detectCashAnomalies(data).find((a) => a.id.startsWith("outflow-"));
    expect(spike).toBeTruthy();
    expect(spike!.id).toBe("outflow-3"); // 900 > 500 → settimana peggiore
  });

  it("segnala i clienti che superano la media dei ritardi di ≥5gg", () => {
    const data = makeForecast([makeWeek()], {
      avg_delay_days_global: 10,
      delays_per_client: { "Cliente Lento": 30, "Cliente Ok": 12 },
    });
    const out = detectCashAnomalies(data);
    const lento = out.find((a) => a.id === "client-Cliente Lento");
    expect(lento).toBeTruthy();
    expect(lento!.severity).toBe("warning"); // +20gg oltre la media → ≥15 ⇒ warning
    // 'Cliente Ok' è solo +2gg sopra la media → sotto la soglia di 5gg
    expect(out.find((a) => a.id === "client-Cliente Ok")).toBeUndefined();
  });

  it("ritardo moderato (5gg ≤ extra < 15gg) ha severità info", () => {
    const data = makeForecast([makeWeek()], {
      avg_delay_days_global: 10,
      delays_per_client: { "Cliente Medio": 17 },
    });
    expect(detectCashAnomalies(data).find((a) => a.id === "client-Cliente Medio")?.severity).toBe("info");
  });

  it("forecast sano → nessuna anomalia", () => {
    const data = makeForecast([
      makeWeek({ week_index: 1, status: "ok", saldo_atteso_eur: 5000 }),
      makeWeek({ week_index: 2, status: "ok", saldo_atteso_eur: 6000 }),
    ]);
    expect(detectCashAnomalies(data)).toEqual([]);
  });
});
