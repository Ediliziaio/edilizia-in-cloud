import { describe, it, expect } from "vitest";

/**
 * Test logica banking / riconciliazione bancaria.
 * Copre: counterparty resolution, classificazione transazioni,
 * calcolo saldo, alert soglia bassa, riconciliazione e forecast.
 * Test puri — zero dipendenze React/Supabase.
 */

// ─── Counterparty resolution (GoCardless) ────────────────────────────────

interface BankTransaction {
  creditor_name?: string | null;
  debtor_name?: string | null;
  creditor_iban?: string | null;
  debtor_iban?: string | null;
  amount: number; // positivo = entrata, negativo = uscita
  booking_date: string;
  description?: string | null;
  reconciliation_status?: "unreconciled" | "reconciled" | "partial" | "excluded";
}

function resolveCounterpartyName(tx: BankTransaction): string {
  return tx.creditor_name || tx.debtor_name || "Sconosciuto";
}

function resolveCounterpartyIban(tx: BankTransaction): string | null {
  return tx.creditor_iban || tx.debtor_iban || null;
}

// ─── Classificazione transazioni ─────────────────────────────────────────

type TipoTransazione = "entrata" | "uscita";

function classificaTipo(tx: BankTransaction): TipoTransazione {
  return tx.amount >= 0 ? "entrata" : "uscita";
}

function isEntrata(tx: BankTransaction): boolean {
  return tx.amount > 0;
}

function isUscita(tx: BankTransaction): boolean {
  return tx.amount < 0;
}

// ─── Calcolo saldo ────────────────────────────────────────────────────────

function calcolaSaldo(transazioni: BankTransaction[]): number {
  return parseFloat(
    transazioni.reduce((acc, tx) => acc + tx.amount, 0).toFixed(2)
  );
}

function calcolaSaldoCumulativo(transazioni: BankTransaction[], saldoIniziale: number): number[] {
  let saldo = saldoIniziale;
  return transazioni.map(tx => {
    saldo = parseFloat((saldo + tx.amount).toFixed(2));
    return saldo;
  });
}

// ─── Alert soglia bassa ───────────────────────────────────────────────────

interface AlertRule {
  rule_type: "balance_below";
  threshold: number;
  company_id: string;
}

function checkLowBalanceAlert(saldoAttuale: number, rule: AlertRule): boolean {
  if (rule.rule_type !== "balance_below") return false;
  return saldoAttuale < rule.threshold;
}

// ─── Riconciliazione ──────────────────────────────────────────────────────

type StatoRiconciliazione = "unreconciled" | "reconciled" | "partial" | "excluded";

const TRANSIZIONI_RICONCILIAZIONE: Record<StatoRiconciliazione, StatoRiconciliazione[]> = {
  unreconciled: ["reconciled", "partial", "excluded"],
  partial:      ["reconciled", "unreconciled", "excluded"],
  reconciled:   ["unreconciled"],
  excluded:     ["unreconciled"],
};

function puoTransizionareRiconciliazione(da: StatoRiconciliazione, a: StatoRiconciliazione): boolean {
  return TRANSIZIONI_RICONCILIAZIONE[da]?.includes(a) ?? false;
}

// ─── Suggerimento riconciliazione ────────────────────────────────────────

interface Invoice {
  id: string;
  amount: number;
  contact_name: string;
  due_date: string;
}

function suggerisciRiconciliazione(tx: BankTransaction, invoices: Invoice[]): Invoice[] {
  const txAbs = Math.abs(tx.amount);
  return invoices.filter(inv => {
    // Importo corrispondente (tolleranza 0.01 per arrotondamenti)
    const importoMatch = Math.abs(inv.amount - txAbs) <= 0.01;
    // Controparte nome match (opzionale)
    const nomeCounterparty = resolveCounterpartyName(tx).toLowerCase();
    const nomeMatch = nomeCounterparty === "sconosciuto" ||
      inv.contact_name.toLowerCase().includes(nomeCounterparty) ||
      nomeCounterparty.includes(inv.contact_name.toLowerCase());
    return importoMatch && nomeMatch;
  });
}

// ─── Forecast 30/60/90 giorni ─────────────────────────────────────────────

interface ForecastEntry {
  data: string;
  entrate_attese: number;
  uscite_attese: number;
}

function calcolaForecast(
  saldoAttuale: number,
  entries: ForecastEntry[],
  giorniOrizz: 30 | 60 | 90
): { balance_finale: number; min_balance: number; giorni_negativi: number } {
  const filtrate = entries.filter(e => {
    const d = new Date(e.data);
    const limite = new Date();
    limite.setDate(limite.getDate() + giorniOrizz);
    return d <= limite;
  });

  let balance = saldoAttuale;
  let min_balance = saldoAttuale;
  let giorni_negativi = 0;

  for (const e of filtrate) {
    balance = parseFloat((balance + e.entrate_attese - e.uscite_attese).toFixed(2));
    if (balance < min_balance) min_balance = balance;
    if (balance < 0) giorni_negativi++;
  }

  return { balance_finale: balance, min_balance, giorni_negativi };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describe("counterparty resolution (GoCardless)", () => {
  it("usa creditor_name per i bonifici in uscita", () => {
    const tx: BankTransaction = { creditor_name: "Fornitore SRL", amount: -500, booking_date: "2024-01-15" };
    expect(resolveCounterpartyName(tx)).toBe("Fornitore SRL");
  });

  it("usa debtor_name per i bonifici in entrata", () => {
    const tx: BankTransaction = { debtor_name: "Cliente SPA", amount: 1220, booking_date: "2024-01-16" };
    expect(resolveCounterpartyName(tx)).toBe("Cliente SPA");
  });

  it("creditor_name ha precedenza su debtor_name", () => {
    const tx: BankTransaction = { creditor_name: "Creditore", debtor_name: "Debitore", amount: -100, booking_date: "2024-01-01" };
    expect(resolveCounterpartyName(tx)).toBe("Creditore");
  });

  it("fallback a 'Sconosciuto' se entrambi null", () => {
    const tx: BankTransaction = { amount: 50, booking_date: "2024-01-01" };
    expect(resolveCounterpartyName(tx)).toBe("Sconosciuto");
  });

  it("risolve IBAN del creditore", () => {
    const tx: BankTransaction = { creditor_iban: "IT60X0542811101000000123456", amount: -200, booking_date: "2024-01-01" };
    expect(resolveCounterpartyIban(tx)).toBe("IT60X0542811101000000123456");
  });

  it("IBAN null se non disponibile", () => {
    const tx: BankTransaction = { amount: 100, booking_date: "2024-01-01" };
    expect(resolveCounterpartyIban(tx)).toBeNull();
  });
});

describe("classificazione transazioni", () => {
  it("importo positivo → entrata", () => {
    const tx: BankTransaction = { amount: 1220, booking_date: "2024-01-01" };
    expect(classificaTipo(tx)).toBe("entrata");
    expect(isEntrata(tx)).toBe(true);
    expect(isUscita(tx)).toBe(false);
  });

  it("importo negativo → uscita", () => {
    const tx: BankTransaction = { amount: -500, booking_date: "2024-01-01" };
    expect(classificaTipo(tx)).toBe("uscita");
    expect(isUscita(tx)).toBe(true);
    expect(isEntrata(tx)).toBe(false);
  });

  it("importo zero → entrata (neutro)", () => {
    const tx: BankTransaction = { amount: 0, booking_date: "2024-01-01" };
    expect(classificaTipo(tx)).toBe("entrata");
  });
});

describe("calcolo saldo", () => {
  it("somma di entrate e uscite", () => {
    const txs: BankTransaction[] = [
      { amount: 1000, booking_date: "2024-01-01" },
      { amount: -300, booking_date: "2024-01-02" },
      { amount:  500, booking_date: "2024-01-03" },
      { amount: -200, booking_date: "2024-01-04" },
    ];
    expect(calcolaSaldo(txs)).toBe(1000);
  });

  it("saldo negativo se le uscite superano le entrate", () => {
    const txs: BankTransaction[] = [
      { amount: 100, booking_date: "2024-01-01" },
      { amount: -500, booking_date: "2024-01-02" },
    ];
    expect(calcolaSaldo(txs)).toBe(-400);
  });

  it("lista vuota → saldo zero", () => {
    expect(calcolaSaldo([])).toBe(0);
  });

  it("saldo cumulativo con saldo iniziale", () => {
    const txs: BankTransaction[] = [
      { amount: 500, booking_date: "2024-01-01" },
      { amount: -200, booking_date: "2024-01-02" },
    ];
    const cumul = calcolaSaldoCumulativo(txs, 1000);
    expect(cumul).toEqual([1500, 1300]);
  });

  it("arrotondamento a 2 decimali", () => {
    const txs: BankTransaction[] = [
      { amount: 0.1, booking_date: "2024-01-01" },
      { amount: 0.2, booking_date: "2024-01-01" },
    ];
    expect(calcolaSaldo(txs)).toBe(0.3);
  });
});

describe("alert soglia saldo bassa", () => {
  const rule: AlertRule = { rule_type: "balance_below", threshold: 1000, company_id: "c1" };

  it("saldo sotto soglia → alert attivato", () => {
    expect(checkLowBalanceAlert(500, rule)).toBe(true);
  });

  it("saldo sopra soglia → nessun alert", () => {
    expect(checkLowBalanceAlert(2000, rule)).toBe(false);
  });

  it("saldo esattamente uguale alla soglia → nessun alert (< non <=)", () => {
    expect(checkLowBalanceAlert(1000, rule)).toBe(false);
  });

  it("saldo negativo → alert sempre attivato", () => {
    expect(checkLowBalanceAlert(-500, rule)).toBe(true);
  });
});

describe("transizioni di stato riconciliazione", () => {
  it("unreconciled → reconciled: permesso", () => {
    expect(puoTransizionareRiconciliazione("unreconciled", "reconciled")).toBe(true);
  });

  it("unreconciled → partial: permesso (riconciliazione parziale)", () => {
    expect(puoTransizionareRiconciliazione("unreconciled", "partial")).toBe(true);
  });

  it("unreconciled → excluded: permesso (transazione irrilevante)", () => {
    expect(puoTransizionareRiconciliazione("unreconciled", "excluded")).toBe(true);
  });

  it("reconciled → unreconciled: permesso (annulla riconciliazione)", () => {
    expect(puoTransizionareRiconciliazione("reconciled", "unreconciled")).toBe(true);
  });

  it("excluded → unreconciled: permesso (ripristina)", () => {
    expect(puoTransizionareRiconciliazione("excluded", "unreconciled")).toBe(true);
  });

  it("reconciled → excluded: NON permesso", () => {
    expect(puoTransizionareRiconciliazione("reconciled", "excluded")).toBe(false);
  });
});

describe("suggerimento riconciliazione", () => {
  const invoices: Invoice[] = [
    { id: "inv-1", amount: 1220, contact_name: "Rossi Mario", due_date: "2024-02-01" },
    { id: "inv-2", amount: 500,  contact_name: "Bianchi SRL", due_date: "2024-02-15" },
    { id: "inv-3", amount: 1220, contact_name: "Verdi SPA",   due_date: "2024-03-01" },
  ];

  it("suggerisce fattura con importo corrispondente e nome match", () => {
    const tx: BankTransaction = { debtor_name: "Rossi Mario", amount: 1220, booking_date: "2024-01-30" };
    const suggestions = suggerisciRiconciliazione(tx, invoices);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe("inv-1");
  });

  it("suggerisce tutte le fatture con stesso importo se controparte sconosciuta", () => {
    const tx: BankTransaction = { amount: 1220, booking_date: "2024-01-30" };
    const suggestions = suggerisciRiconciliazione(tx, invoices);
    // Entrambe le fatture da 1220 (id inv-1 e inv-3)
    expect(suggestions).toHaveLength(2);
  });

  it("nessun suggerimento se importo non corrisponde", () => {
    const tx: BankTransaction = { debtor_name: "Bianchi SRL", amount: 999, booking_date: "2024-01-30" };
    const suggestions = suggerisciRiconciliazione(tx, invoices);
    expect(suggestions).toHaveLength(0);
  });

  it("tolleranza 0.01€ per arrotondamenti bancari", () => {
    const tx: BankTransaction = { debtor_name: "Bianchi SRL", amount: 500.01, booking_date: "2024-01-30" };
    const suggestions = suggerisciRiconciliazione(tx, invoices);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].id).toBe("inv-2");
  });
});

describe("forecast cash flow", () => {
  const oggi = new Date().toISOString().split("T")[0];
  const tra10 = new Date(Date.now() + 10 * 86400000).toISOString().split("T")[0];
  const tra40 = new Date(Date.now() + 40 * 86400000).toISOString().split("T")[0];

  const entries: ForecastEntry[] = [
    { data: tra10, entrate_attese: 5000, uscite_attese: 2000 },
    { data: tra40, entrate_attese: 3000, uscite_attese: 1000 },
  ];

  it("forecast 30gg: include solo eventi nei prossimi 30 giorni", () => {
    const r = calcolaForecast(10000, entries, 30);
    // Solo tra10 rientra nei 30gg: +5000 -2000 = +3000
    expect(r.balance_finale).toBe(13000);
  });

  it("forecast 90gg: include tutti gli eventi", () => {
    const r = calcolaForecast(10000, entries, 90);
    // tra10: +3000 → 13000; tra40: +2000 → 15000
    expect(r.balance_finale).toBe(15000);
  });

  it("rileva saldo minimo durante il periodo", () => {
    const entriesNegative: ForecastEntry[] = [
      { data: tra10, entrate_attese: 0, uscite_attese: 8000 },
    ];
    const r = calcolaForecast(5000, entriesNegative, 30);
    expect(r.balance_finale).toBe(-3000);
    expect(r.min_balance).toBe(-3000);
    expect(r.giorni_negativi).toBe(1);
  });

  it("nessun evento → saldo invariato", () => {
    const r = calcolaForecast(5000, [], 30);
    expect(r.balance_finale).toBe(5000);
    expect(r.giorni_negativi).toBe(0);
  });
});
