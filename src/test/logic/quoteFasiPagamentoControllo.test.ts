/**
 * Fasi di pagamento del preventivo (controllo del 06/10/2026): le rate sommano al
 * 100% e agli euro del totale, nell'ordine in cui si scrivono. Atteso calcolato in
 * centesimi interi, a parte, senza passare da recalcPhaseAmounts.
 */
import { describe, expect, it } from "vitest";
import {
  type QuotePaymentPhase, parseQuotePaymentPhases, paymentPlanError, phasesAmountTotal, phasesPercentTotal, recalcPhaseAmounts,
} from "@/lib/preventivi/paymentTerms";

const fase = (label: string, percent: number, type: QuotePaymentPhase["type"] = "deposit"): QuotePaymentPhase => ({ label, type, percent, amount: 0 });
const importi = (fasi: QuotePaymentPhase[], totale: number) => recalcPhaseAmounts(fasi, totale).map((f) => f.amount);
const cent = (euro: number) => Math.round(euro * 100);

describe("fasi di pagamento: scenari a mano", () => {
  it("1) 30/70 su 12.200 € = 3.660 + 8.540", () => {
    expect(importi([fase("Acconto", 30), fase("Saldo", 70, "balance")], 12200)).toEqual([3660, 8540]);
  });

  it("2) tre rate 33,33 / 33,33 / 33,34 su 100 € = 33,33 + 33,33 + 33,34", () => {
    expect(importi([fase("a", 33.33), fase("b", 33.33), fase("c", 33.34, "balance")], 100)).toEqual([33.33, 33.33, 33.34]);
  });

  it("3) 40/30/30 su 10.001,01 €: 4.000,40 + 3.000,30 e l'ultima prende il resto (3.000,31)", () => {
    // 40% = 4.000,404 → 4.000,40 ; 30% = 3.000,303 → 3.000,30 ; resto 10.001,01 − 7.000,70 = 3.000,31.
    expect(importi([fase("a", 40), fase("b", 30), fase("c", 30, "balance")], 10001.01)).toEqual([4000.4, 3000.3, 3000.31]);
  });

  it("4) una fase sola al 100% vale il totale", () => {
    expect(importi([fase("Unica", 100, "balance")], 7777.77)).toEqual([7777.77]);
  });

  it("5) fasi a 0%: il resto va all'ultima fase con una percentuale vera, non a quelle a zero", () => {
    expect(importi([fase("a", 50), fase("zero", 0), fase("b", 50, "balance")], 999.99)).toEqual([500, 0, 499.99]);
    expect(importi([fase("a", 100), fase("zero", 0, "balance")], 500)).toEqual([500, 0]);
  });

  it("6) totale zero, negativo o rotto: tutte le fasi a 0 €, mai NaN né negativo", () => {
    for (const totale of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const v = importi([fase("a", 30), fase("b", 70, "balance")], totale);
      expect(v.every((x) => x === 0 && !Object.is(x, -0))).toBe(true);
    }
  });

  it("7) un piano che non fa 100% resta com'è e mostra gli euro che chiede, senza compensazioni nascoste", () => {
    const fasi = [fase("a", 30), fase("b", 30, "balance")];
    expect(importi(fasi, 1000)).toEqual([300, 300]);
    expect(paymentPlanError(fasi)).toMatch(/100%/);
    expect(importi([fase("a", 60), fase("b", 60, "balance")], 1000)).toEqual([600, 600]);
  });

  it("8) percentuali fuori da 0–100, senza descrizione o rotte: piano non valido", () => {
    expect(paymentPlanError([fase("a", 120), fase("b", -20, "balance")])).toMatch(/0 e 100/);
    expect(paymentPlanError([fase("a", Number.NaN), fase("b", 100, "balance")])).toMatch(/0 e 100/);
    expect(paymentPlanError([fase("  ", 100, "balance")])).toMatch(/descrizione/);
    expect(paymentPlanError([])).toBeNull();
    expect(paymentPlanError([fase("a", 50), fase("b", 50, "balance")])).toBeNull();
  });

  it("9) l'ordine delle fasi non cambia, e i tipi e le descrizioni restano", () => {
    const fasi = [fase("Alla firma", 20, "deposit"), fase("Posa", 30, "financing"), fase("Collaudo", 50, "balance")];
    const r = recalcPhaseAmounts(fasi, 2000);
    expect(r.map((f) => [f.label, f.type, f.percent])).toEqual(fasi.map((f) => [f.label, f.type, f.percent]));
    expect(r.map((f) => f.amount)).toEqual([400, 600, 1000]);
  });

  it("10) totale e somme: percentuali al centesimo di punto, euro al centesimo", () => {
    const r = recalcPhaseAmounts([fase("a", 33.33), fase("b", 33.33), fase("c", 33.34, "balance")], 1234.56);
    expect(phasesPercentTotal(r)).toBe(100);
    expect(phasesAmountTotal(r)).toBe(1234.56);
  });

  it("11) il JSON salvato si legge in modo difensivo", () => {
    expect(parseQuotePaymentPhases(null)).toEqual([]);
    expect(parseQuotePaymentPhases("boh")).toEqual([]);
    expect(parseQuotePaymentPhases([null, 5, { label: 7, type: "boh", percent: "30,5", amount: "x" }, { label: "Saldo", type: "balance", percent: 70.5, amount: 100 }]))
      .toEqual([
        { label: "7", type: "deposit", percent: 0, amount: 0 },
        { label: "Saldo", type: "balance", percent: 70.5, amount: 100 },
      ]);
  });
});

describe("fasi di pagamento: 4.000 piani casuali", () => {
  function generatore(seme: number) {
    let a = seme;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("la somma degli importi è il totale al centesimo, ogni rata è a meno di (n−1) centesimi dalla sua quota", () => {
    const rnd = generatore(20261006);
    for (let i = 0; i < 4000; i++) {
      const n = 2 + Math.floor(rnd() * 4);
      // Percentuali a due decimali che sommano 100: si spezza 10.000 centesimi di punto.
      const tagli = Array.from({ length: n - 1 }, () => Math.floor(rnd() * 10001)).sort((x, y) => x - y);
      const parti = [...tagli, 10000].map((t, k) => t - (k === 0 ? 0 : [...tagli, 10000][k - 1]) );
      const fasi = parti.map((p, k) => fase(`F${k + 1}`, p / 100, k === n - 1 ? "balance" : "deposit"));
      const totaleCent = Math.floor(rnd() * 100_000_000);
      const r = recalcPhaseAmounts(fasi, totaleCent / 100);
      expect(paymentPlanError(fasi)).toBeNull();
      // Somma esatta, in centesimi interi.
      expect(r.reduce((s, f) => s + cent(f.amount), 0)).toBe(totaleCent);
      r.forEach((f, k) => {
        expect(f.amount).toBeGreaterThanOrEqual(0);
        // Quota ideale in centesimi interi (naïf: totale × centesimi di punto / 10.000, arrotondata).
        const quota = Math.round((totaleCent * parti[k]) / 10000);
        expect(Math.abs(cent(f.amount) - quota)).toBeLessThanOrEqual(n);
      });
    }
  });
});
