import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateCollectedGrossFromInstallments } from "@/lib/commissions";
import { conSaldoFinale, importoSaldoFinale, indiceSaldoFinale, rateDaIncassare, sommaRateNonSaldo, type CommessaPerRate, type RataDaLeggere } from "@/lib/orders/saldoFinale";

// DEMO-2024-H021: 211.764,71 + IVA 10% = 232.941,18; acconto, SAL intermedio e saldo.
const h021 = [
  { position: 0, type: "deposit", amount: 69882.35, label: "Acconto 30%" },
  { position: 1, type: "balance", amount: 93176.47, label: "SAL 40%" },
  { position: 2, type: "balance", amount: 69882.36, label: "Saldo 30%" },
];
const totaleH021 = 211764.71 * 1.1;

describe("il saldo finale del piano rate", () => {
  it("è l'ultima rata «balance», anche se le rate arrivano fuori ordine", () => {
    expect(indiceSaldoFinale(h021)).toBe(2);
    expect(indiceSaldoFinale([h021[2], h021[0], h021[1]])).toBe(0);
    expect(indiceSaldoFinale([{ type: "deposit", position: 0, amount: 1 }])).toBe(-1);
  });

  it("il residuo toglie anche i SAL intermedi", () => {
    expect(sommaRateNonSaldo(h021)).toBeCloseTo(69882.35 + 93176.47, 2);
    expect(importoSaldoFinale(h021, totaleH021)).toBeCloseTo(69882.36, 1);
  });

  it("DEMO-2024-H021: dopo il salvataggio le tre rate restano 69.882,35 / 93.176,47 / 69.882,36", () => {
    const saldo = importoSaldoFinale(h021, totaleH021);
    const salvate = conSaldoFinale(h021, saldo);
    expect(salvate[0].amount).toBe(69882.35);
    expect(salvate[1].amount).toBe(93176.47);
    expect(salvate[2].amount).toBeCloseTo(69882.36, 1);
    const totale = salvate.reduce((s, r) => s + r.amount, 0);
    expect(totale).toBeCloseTo(totaleH021, 1);
  });

  it("toglie il costo della finanziaria e non scende sotto zero", () => {
    expect(importoSaldoFinale([{ type: "deposit", amount: 300 }, { type: "balance", amount: 0 }], 1000, 50)).toBe(650);
    expect(importoSaldoFinale([{ type: "deposit", amount: 1300 }, { type: "balance", amount: 0 }], 1000)).toBe(0);
  });

  it("un saldo finale con l'importo del contratto si lascia com'è", () => {
    const rate = [{ type: "deposit", amount: 100, fisso: false }, { type: "balance", amount: 400, fisso: true }];
    expect(conSaldoFinale(rate, 900, (r) => r.fisso)[1].amount).toBe(400);
    expect(conSaldoFinale(rate, 900)[1].amount).toBe(900);
  });

  it("nuova commessa e modifica usano la regola condivisa nel salvataggio", () => {
    for (const file of ["src/pages/azienda/EditOrder.tsx", "src/pages/azienda/CreateOrder.tsx"]) {
      const src = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(src).toContain("conSaldoFinale(installments, balance");
      expect(src).toContain("importoSaldoFinale(installments, totalWithVat, fCostForBalance)");
      expect(src).not.toMatch(/i\.type === 'balance' \? \{ \.\.\.i, amount: balance \}/);
    }
  });
});

describe("colonne riassuntive della commessa", () => {
  it("il saldo riassunto è l'ultima rata saldo, non il SAL intermedio", async () => {
    const { installmentsToLegacyColumns } = await import("@/lib/orderUtils");
    const col = installmentsToLegacyColumns([
      { type: "deposit", position: 0, amount: 69882.35, is_paid: true, paid_date: "2026-01-10", expected_date: null },
      { type: "balance", position: 1, amount: 93176.47, is_paid: true, paid_date: "2026-03-10", expected_date: null },
      { type: "balance", position: 2, amount: 69882.36, is_paid: false, paid_date: null, expected_date: "2026-12-01" },
    ] as never);
    expect(col).toMatchObject({ balance_amount: 69882.36, balance_paid: false, balance_expected_date: "2026-12-01" });
  });
});

describe("modifica commessa con una variante approvata", () => {
  it("il saldo conta la variante: DEMO-CFO-MIX-02 resta 29.535", () => {
    // Contratto 86.000 + variante 3.500, IVA 10% = 98.450; acconto 29.535 e SAL 39.380.
    const rate = [
      { type: "deposit", position: 0, amount: 29535 },
      { type: "balance", position: 1, amount: 39380 },
      { type: "balance", position: 2, amount: 29535 },
    ];
    expect(importoSaldoFinale(rate, (86000 + 3500) * 1.1)).toBe(29535);
    const codice = readFileSync(resolve(process.cwd(), "src/pages/azienda/EditOrder.tsx"), "utf8");
    expect(codice).toContain("(total + variazioniApprovate) * (1 + vat / 100)");
  });
});

describe("modifica commessa: si salva solo con le varianti lette", () => {
  it("il pulsante resta fermo durante la lettura e in caso di errore, con l'avviso", () => {
    const codice = readFileSync(resolve(process.cwd(), "src/pages/azienda/EditOrder.tsx"), "utf8");
    expect(codice).toContain("disabled={updateOrderMutation.isPending || variazioniInLettura || variazioniInErrore}");
    expect(codice).toContain("if (variazioniInLettura || variazioniInErrore) {");
    expect(codice).toContain("Non riesco a leggere le varianti: riprova prima di salvare");
  });
});

describe("rate da incassare con la regola della scheda commessa (come public.rate_da_incassare)", () => {
  const commessa = (patch: Partial<CommessaPerRate> = {}): CommessaPerRate =>
    ({ total_amount: 10000, vat_rate: 10, payment_type: "standard", financing_cost: 0, variazioni_approvate: 0, ...patch });
  const rata = (patch: Partial<RataDaLeggere> & { id: string }): RataDaLeggere =>
    ({ order_id: "o1", type: "deposit", position: 0, amount: 0, is_paid: false, expected_date: "2026-10-01", documento_fiscale_id: null, ...patch });

  it("il saldo finale è il residuo di contratto più varianti, non l'importo scritto sulla rata", () => {
    const rate = [
      rata({ id: "a", type: "deposit", position: 0, amount: 3300, is_paid: true }),
      rata({ id: "s", type: "balance", position: 1, amount: 100 }),
    ];
    const r = rateDaIncassare(rate, new Map([["o1", commessa({ variazioni_approvate: 1000 })]]));
    // (10.000 + 1.000) × 1,10 = 12.100, meno l'acconto 3.300.
    expect(r).toEqual([{ id: "s", order_id: "o1", expected_date: "2026-10-01", amount: 8800, finanziamento: false }]);
  });

  it("la rata del finanziamento c'è, segnata; il costo della finanziaria si toglie solo a finanziamento", () => {
    const rate = [
      rata({ id: "a", type: "deposit", position: 0, amount: 1000 }),
      rata({ id: "f", type: "financing", position: 1, amount: 9000 }),
      rata({ id: "s", type: "balance", position: 2, amount: 0 }),
    ];
    const finanziata = rateDaIncassare(rate, new Map([["o1", commessa({ payment_type: "financing", financing_cost: 500 })]]));
    expect(finanziata.map(r => [r.id, r.amount, r.finanziamento])).toEqual([["a", 1000, false], ["f", 9000, true], ["s", 500, false]]);
    const senza = rateDaIncassare(rate, new Map([["o1", commessa({ payment_type: "standard", financing_cost: 500 })]]));
    expect(senza.find(r => r.id === "s")?.amount).toBe(1000);
  });

  it("piano senza saldo: la parte non coperta da rate è una riga senza data", () => {
    // 18.200 + IVA 22% = 22.204; due acconti da 1.600, uno pagato → 1.600 + 19.004 scoperti = 20.604.
    const rate = [
      rata({ id: "a1", type: "deposit", position: 0, amount: 1600, is_paid: true }),
      rata({ id: "a2", type: "deposit", position: 1, amount: 1600 }),
    ];
    const r = rateDaIncassare(rate, new Map([["o1", commessa({ total_amount: 18200, vat_rate: 22 })]]));
    expect(r.map(x => [x.id, x.expected_date, x.amount])).toEqual([["o1:non-pianificato", null, 19004], ["a2", "2026-10-01", 1600]]);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(20604);
  });

  it("toglie quanto già pagato sulla fattura collegata, mai sotto zero", () => {
    const rate = [
      rata({ id: "a", type: "deposit", position: 0, amount: 3300, documento_fiscale_id: "d1" }),
      rata({ id: "b", type: "deposit", position: 1, amount: 1000, documento_fiscale_id: "d2" }),
      rata({ id: "s", type: "balance", position: 2, amount: 0 }),
    ];
    const r = rateDaIncassare(rate, new Map([["o1", commessa()]]), new Map([["d1", 1300], ["d2", 5000]]));
    expect(r.map(x => [x.id, x.amount])).toEqual([["a", 2000], ["b", 0], ["s", 6700]]);
  });

  it("il cruscotto legge le rate dalla regola del database, e il venduto conta le varianti", () => {
    const codice = readFileSync(resolve(process.cwd(), "src/hooks/useCruscottoData.ts"), "utf8");
    expect(codice).toContain('rpc("cruscotto_rate_da_incassare", { p_company_id: companyId })');
    expect(codice).toContain('.select("id, margine, preventivo_totale, consuntivo, variazioni_approvate")');
    expect(codice).toContain("margini.reduce((s, m) => s + safeNumber(m.variazioni_approvate), 0)");
    expect(codice).not.toContain('.select("amount, expected_date, order:orders!inner(company_id)")');
  });
});

describe("finanziamento con il saldo già a zero", () => {
  it("il costo della finanziaria che avanza si toglie dalla rata della finanziaria (7.733,41)", () => {
    // 7.272,73 + IVA 10% = 8.000; costo finanziaria 266,59; acconto 3.000, finanziamento 5.000, saldo ~0.
    const rate: RataDaLeggere[] = [
      { id: "a", order_id: "o", type: "deposit", position: 0, amount: 3000, is_paid: false, expected_date: "2026-06-01", documento_fiscale_id: null },
      { id: "f", order_id: "o", type: "financing", position: 1, amount: 5000, is_paid: false, expected_date: "2026-06-16", documento_fiscale_id: null },
      { id: "s", order_id: "o", type: "balance", position: 2, amount: 0, is_paid: false, expected_date: null, documento_fiscale_id: null },
    ];
    const r = rateDaIncassare(rate, new Map([["o", { total_amount: 7272.73, vat_rate: 10, payment_type: "financing", financing_cost: 266.59, variazioni_approvate: 0 }]]));
    expect(Math.round(r.reduce((s, x) => s + x.amount, 0) * 100) / 100).toBe(7733.41);
  });
});

describe("variante approvata dopo il saldo pagato", () => {
  const rate: RataDaLeggere[] = [
    { id: "a", order_id: "o", type: "deposit", position: 0, amount: 4000, is_paid: true, paid_date: "2026-05-01", expected_date: "2026-05-01", documento_fiscale_id: null },
    { id: "s", order_id: "o", type: "balance", position: 1, amount: 0, is_paid: true, paid_date: "2026-07-01", expected_date: "2026-07-01", documento_fiscale_id: null },
  ];
  const commessa = { total_amount: 10000, vat_rate: 10, payment_type: "cash", financing_cost: 0,
    varianti: [{ importo: 1000, il: "2026-06-10" }, { importo: 2000, il: "2026-08-01" }] };

  it("il saldo pagato resta quello del giorno; la variante successiva è da incassare a parte", () => {
    // Al saldo: (10.000 + 1.000) × 1,10 − 4.000 = 8.100. Dopo: 2.000 × 1,10 = 2.200 non pianificati.
    const r = rateDaIncassare(rate, new Map([["o", commessa]]));
    expect(r).toEqual([{ id: "o:non-pianificato", order_id: "o", expected_date: null, amount: 2200, finanziamento: false }]);
  });

  it("l'incassato della scheda non cresce con la variante successiva", () => {
    const incassato = calculateCollectedGrossFromInstallments({
      installments: rate, totalAmount: 13000, vatRate: 10, includeFinancing: true, varianti: commessa.varianti,
    });
    expect(incassato).toBe(12100);
  });

  it("la rata della finanziaria perde al massimo il costo della finanziaria", () => {
    const conFinanziaria: RataDaLeggere[] = [
      { id: "a", order_id: "o", type: "deposit", position: 0, amount: 9000, is_paid: false, expected_date: null, documento_fiscale_id: null },
      { id: "f", order_id: "o", type: "financing", position: 1, amount: 5000, is_paid: false, expected_date: null, documento_fiscale_id: null },
      { id: "s", order_id: "o", type: "balance", position: 2, amount: 0, is_paid: false, expected_date: null, documento_fiscale_id: null },
    ];
    const r = rateDaIncassare(conFinanziaria, new Map([["o", { total_amount: 10000, vat_rate: 0, payment_type: "financing", financing_cost: 300, variazioni_approvate: 0 }]]));
    expect(r.find(x => x.id === "f")?.amount).toBe(4700);
  });
});
