import { describe, it, expect } from "vitest";
import {
  fmtEur,
  fuzzyMatch,
  computeMatchScore,
  invoiceNumberInCausale,
  pickAutoMatch,
  pickBestSuggestion,
  autoMatchSummary,
  computePaymentApplication,
  computePaymentReversal,
  detectReconAnomalies,
} from "@/lib/finance/reconciliationAnalysis";

/**
 * Test logica finanziaria estratta da BankReconciliation.
 * Esercita il CODICE DI PRODUZIONE (import da @/lib/finance/*), così la logica
 * money-adjacent è verificabile senza login né React/Supabase.
 *
 * Tutto in sola lettura: nessuna funzione qui muove denaro o scrive su DB.
 */

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

  it("l'IBAN vale 30 punti UNA volta sola, anche se compare su entrambi i lati", () => {
    // Regressione: ordinante e beneficiario uguali contavano +30 ciascuno (+60)
    // e ripetevano la motivazione, gonfiando il punteggio su un indizio solo.
    const m = computeMatchScore(
      { amount: 1000, creditor_iban: "IT0012345678", debtor_iban: "IT0012345678" },
      { total: 1000, paid_amount: 0, bank_iban: "IT0012345678" },
    );
    expect(m!.score).toBe(80);
    expect(m!.reasons.filter((r) => r === "IBAN corrispondente")).toHaveLength(1);
  });

  it("IBAN diverso non aggiunge punti", () => {
    const m = computeMatchScore(
      { amount: 1000, creditor_iban: "IT9999999999" },
      { total: 1000, paid_amount: 0, bank_iban: "IT0012345678" },
    );
    expect(m!.score).toBe(50);
    expect(m!.reasons).not.toContain("IBAN corrispondente");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RICONCILIAZIONE — invoiceNumberInCausale (il segnale più forte: +60)
// ═══════════════════════════════════════════════════════════════════════════

describe("invoiceNumberInCausale", () => {
  it("riconosce il numero citato nella causale del bonifico", () => {
    expect(invoiceNumberInCausale("SALDO FATTURA 415/2026", "415/2026")).toBe(true);
    expect(invoiceNumberInCausale("Pagamento Fatt. 412-2026", "412/2026")).toBe(true);
  });

  it("numero corto: serve il marcatore fattura/ft/n. accanto", () => {
    expect(invoiceNumberInCausale("ns. ft 5/2026", "5/2026")).toBe(true);
    expect(invoiceNumberInCausale("pagamento fattura 37", "37")).toBe(true);
  });

  it("numero di una sola cifra: mai riconosciuto (troppi falsi positivi)", () => {
    expect(invoiceNumberInCausale("bonifico importo 5000 euro", "5")).toBe(false);
  });

  it("numero assente nella causale → false", () => {
    expect(invoiceNumberInCausale("BONIFICO SEPA DA MARIO ROSSI", "415/2026")).toBe(false);
  });

  it("stringhe vuote → false", () => {
    expect(invoiceNumberInCausale("", "415/2026")).toBe(false);
    expect(invoiceNumberInCausale("FATTURA 415", "")).toBe(false);
  });

  it("dentro computeMatchScore vale 60 punti anche se l'importo è un acconto", () => {
    const m = computeMatchScore(
      { amount: 500, description: "SALDO FATTURA 415/2026" },
      { total: 1000, paid_amount: 0, invoice_number: "415/2026" },
    );
    expect(m).not.toBeNull();
    expect(m!.reasons).toContain("N° fattura in causale");
    expect(m!.score).toBe(70); // 60 n° fattura + 10 possibile acconto
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RICONCILIAZIONE — pickBestSuggestion (suggerimento inline, guard ambiguità)
// ═══════════════════════════════════════════════════════════════════════════

describe("pickBestSuggestion", () => {
  const inv = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    invoice_number: id,
    total: 1000,
    paid_amount: 0,
    ...over,
  });

  it("nessun candidato → null", () => {
    expect(pickBestSuggestion({ amount: 1000 }, [])).toBeNull();
  });

  it("candidato unico → non ambiguo", () => {
    const r = pickBestSuggestion({ amount: 1000 }, [inv("A")]);
    expect(r).not.toBeNull();
    expect(r!.ambiguous).toBe(false);
    expect(r!.candidates).toBe(1);
  });

  it("due fatture a pari merito → ambiguo (niente abbinamento con un clic)", () => {
    const r = pickBestSuggestion({ amount: 1000 }, [inv("A"), inv("B")]);
    expect(r!.ambiguous).toBe(true);
    expect(r!.candidates).toBe(2);
  });

  it("vincitore netto (distacco ≥ 15) → non ambiguo e vince il migliore", () => {
    // A: importo esatto (50) + nome (20) = 70 · B: importo esatto (50) = 50
    const r = pickBestSuggestion(
      { amount: 1000, creditor_name: "Mario Rossi" },
      [inv("A", { client_company_name: "Mario Rossi" }), inv("B")],
    );
    expect(r!.best.invoice.id).toBe("A");
    expect(r!.ambiguous).toBe(false);
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
// RICONCILIAZIONE — pickAutoMatch (guard anti-ambiguità per auto-link denaro)
// ═══════════════════════════════════════════════════════════════════════════

describe("pickAutoMatch", () => {
  // tx che combacia con l'IBAN/nome dei fixture invoice qui sotto
  const tx = {
    id: "t1",
    amount: -1000,
    creditor_iban: "IT00 1234 5678",
    creditor_name: "ACME SRL",
  };
  // exact(50) + IBAN(30) + nome(20) = 100
  const inv100 = (id: string) => ({
    id,
    total: 1000,
    paid_amount: 0,
    bank_iban: "it0012345678",
    client_company_name: "ACME SRL",
  });
  // simile(35) + IBAN(30) + nome(20) = 85 (diff 5 entro tolleranza)
  const inv85 = (id: string) => ({
    id,
    total: 1005,
    paid_amount: 0,
    bank_iban: "it0012345678",
    client_company_name: "ACME SRL",
  });
  // exact(50) + IBAN(30), nessun nome = 80
  const inv80 = (id: string) => ({
    id,
    total: 1000,
    paid_amount: 0,
    bank_iban: "it0012345678",
    client_company_name: "Altro Cliente",
  });
  // exact(50) + nome(20), nessun IBAN = 70 (< soglia 80)
  const inv70 = (id: string) => ({
    id,
    total: 1000,
    paid_amount: 0,
    client_company_name: "ACME SRL",
  });

  it("lista vuota → null", () => {
    expect(pickAutoMatch(tx, [])).toBeNull();
  });

  it("nessun candidato raggiunge la soglia (80) → null", () => {
    expect(pickAutoMatch(tx, [inv70("i1")])).toBeNull();
  });

  it("singolo candidato forte → lo restituisce", () => {
    const best = pickAutoMatch(tx, [inv100("i1"), inv70("i2")]);
    expect(best?.invoice.id).toBe("i1");
    expect(best?.score).toBe(100);
  });

  it("vincitore netto (distacco ≥ 15: 100 vs 85) → restituisce il migliore", () => {
    const best = pickAutoMatch(tx, [inv85("i1"), inv100("i2")]);
    expect(best?.invoice.id).toBe("i2");
  });

  it("ambiguo: due candidati pari (100 vs 100) → null, decide l'utente", () => {
    expect(pickAutoMatch(tx, [inv100("i1"), inv100("i2")])).toBeNull();
  });

  it("ambiguo: distacco < 15 (85 vs 80) → null", () => {
    expect(pickAutoMatch(tx, [inv85("i1"), inv80("i2")])).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RICONCILIAZIONE — aritmetica pagamento (money-critical)
// ═══════════════════════════════════════════════════════════════════════════

describe("computePaymentApplication", () => {
  it("pagamento parziale: aumenta paid_amount, stato invariato", () => {
    const r = computePaymentApplication({ paid_amount: 0, total: 1000, status: "sent" }, 400);
    expect(r.newPaidAmount).toBe(400);
    expect(r.newStatus).toBe("sent");
  });

  it("pagamento che salda il totale → stato 'paid'", () => {
    const r = computePaymentApplication({ paid_amount: 600, total: 1000, status: "sent" }, 400);
    expect(r.newPaidAmount).toBe(1000);
    expect(r.newStatus).toBe("paid");
  });

  it("pagamento che eccede il totale → stato 'paid'", () => {
    const r = computePaymentApplication({ paid_amount: 0, total: 1000, status: "overdue" }, 1200);
    expect(r.newPaidAmount).toBe(1200);
    expect(r.newStatus).toBe("paid");
  });

  it("paid_amount nullo trattato come 0", () => {
    const r = computePaymentApplication({ paid_amount: null, total: 500, status: "sent" }, 200);
    expect(r.newPaidAmount).toBe(200);
    expect(r.newStatus).toBe("sent");
  });
});

describe("computePaymentReversal", () => {
  it("annulla un pagamento parziale: riduce paid_amount, stato invariato se non era 'paid'", () => {
    const r = computePaymentReversal({ paid_amount: 1000, total: 1000, status: "sent" }, 400);
    expect(r.newPaidAmount).toBe(600);
    expect(r.newStatus).toBe("sent");
  });

  it("fattura 'paid' scollegata → torna 'delivered'", () => {
    const r = computePaymentReversal({ paid_amount: 1000, total: 1000, status: "paid" }, 400);
    expect(r.newPaidAmount).toBe(600);
    expect(r.newStatus).toBe("delivered");
  });

  it("non scende mai sotto zero", () => {
    const r = computePaymentReversal({ paid_amount: 300, total: 1000, status: "paid" }, 500);
    expect(r.newPaidAmount).toBe(0);
    expect(r.newStatus).toBe("delivered");
  });

  it("oggetto vuoto (null-tolerant): paid 0, stato undefined", () => {
    const r = computePaymentReversal({}, 100);
    expect(r.newPaidAmount).toBe(0);
    expect(r.newStatus).toBeUndefined();
  });
});

describe("autoMatchSummary", () => {
  it("alcuni riconciliati, altri da abbinare", () => {
    expect(autoMatchSummary(3, 10)).toBe("Auto-match: 3 riconciliate · 7 ancora da abbinare");
  });

  it("tutti riconciliati → messaggio completo", () => {
    expect(autoMatchSummary(5, 5)).toBe("Auto-match completato: 5 riconciliazioni");
  });

  it("nessun abbinamento sicuro ma transazioni presenti → invito alla verifica manuale", () => {
    expect(autoMatchSummary(0, 4)).toBe(
      "Nessun abbinamento automatico sicuro: 4 transazioni da verificare manualmente",
    );
  });

  it("nessuna transazione da riconciliare", () => {
    expect(autoMatchSummary(0, 0)).toBe("Nessuna transazione da riconciliare");
  });
});
