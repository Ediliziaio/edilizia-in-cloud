import { describe, it, expect } from "vitest";
import { addDays, subDays, format, startOfMonth, endOfMonth } from "date-fns";

/**
 * Test logica scadenzario — date overdue, calcoli saldo, filtri.
 * Il scadenzario gestisce incassi e pagamenti reali: bug = perdita finanziaria.
 */

// ─── Logica ripresa da useScadenzario ─────────────────────────────────────────

type ScadenzaStatus = "da_pagare" | "parziale" | "pagata" | "annullata";

interface Scadenza {
  due_date: string;
  status: ScadenzaStatus;
  amount: number;
  paid_amount: number;
}

function isOverdue(s: Scadenza): boolean {
  if (s.status === "pagata" || s.status === "annullata") return false;
  return new Date(s.due_date) < new Date();
}

function isDueToday(s: Scadenza): boolean {
  if (s.status === "pagata" || s.status === "annullata") return false;
  const today = format(new Date(), "yyyy-MM-dd");
  return s.due_date === today;
}

function getRemainingAmount(s: Scadenza): number {
  return Math.max(0, s.amount - (s.paid_amount ?? 0));
}

function getDateRange(preset: string, today: Date): { from: string; to: string } | null {
  switch (preset) {
    case "questo_mese":
      return {
        from: format(startOfMonth(today), "yyyy-MM-dd"),
        to: format(endOfMonth(today), "yyyy-MM-dd"),
      };
    case "30gg":
      return {
        from: format(today, "yyyy-MM-dd"),
        to: format(addDays(today, 30), "yyyy-MM-dd"),
      };
    case "90gg":
      return {
        from: format(today, "yyyy-MM-dd"),
        to: format(addDays(today, 90), "yyyy-MM-dd"),
      };
    default:
      return null;
  }
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("isOverdue", () => {
  it("scadenza ieri è overdue", () => {
    const s: Scadenza = {
      due_date: format(subDays(new Date(), 1), "yyyy-MM-dd"),
      status: "da_pagare",
      amount: 1000,
      paid_amount: 0,
    };
    expect(isOverdue(s)).toBe(true);
  });

  it("scadenza domani NON è overdue", () => {
    const s: Scadenza = {
      due_date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
      status: "da_pagare",
      amount: 1000,
      paid_amount: 0,
    };
    expect(isOverdue(s)).toBe(false);
  });

  it("scadenza pagata NON è overdue anche se nel passato", () => {
    const s: Scadenza = {
      due_date: format(subDays(new Date(), 30), "yyyy-MM-dd"),
      status: "pagata",
      amount: 1000,
      paid_amount: 1000,
    };
    expect(isOverdue(s)).toBe(false);
  });

  it("scadenza annullata NON è overdue", () => {
    const s: Scadenza = {
      due_date: format(subDays(new Date(), 10), "yyyy-MM-dd"),
      status: "annullata",
      amount: 500,
      paid_amount: 0,
    };
    expect(isOverdue(s)).toBe(false);
  });

  it("scadenza parziale nel passato È overdue", () => {
    const s: Scadenza = {
      due_date: format(subDays(new Date(), 5), "yyyy-MM-dd"),
      status: "parziale",
      amount: 1000,
      paid_amount: 300,
    };
    expect(isOverdue(s)).toBe(true);
  });
});

describe("getRemainingAmount", () => {
  it("calcola importo residuo correttamente", () => {
    expect(getRemainingAmount({ due_date: "", status: "parziale", amount: 1000, paid_amount: 300 })).toBe(700);
  });

  it("non ritorna mai valori negativi (pagamento in eccesso)", () => {
    expect(getRemainingAmount({ due_date: "", status: "pagata", amount: 1000, paid_amount: 1200 })).toBe(0);
  });

  it("paid_amount 0 → residuo = amount totale", () => {
    expect(getRemainingAmount({ due_date: "", status: "da_pagare", amount: 500, paid_amount: 0 })).toBe(500);
  });
});

describe("getDateRange preset", () => {
  const today = new Date("2026-04-01");

  it("questo_mese: dal 1 al 30 aprile 2026", () => {
    const range = getDateRange("questo_mese", today);
    expect(range?.from).toBe("2026-04-01");
    expect(range?.to).toBe("2026-04-30");
  });

  it("30gg: da oggi a +30 giorni", () => {
    const range = getDateRange("30gg", today);
    expect(range?.from).toBe("2026-04-01");
    expect(range?.to).toBe("2026-05-01");
  });

  it("90gg: da oggi a +90 giorni", () => {
    const range = getDateRange("90gg", today);
    expect(range?.from).toBe("2026-04-01");
    expect(range?.to).toBe("2026-06-30");
  });

  it("preset sconosciuto → null", () => {
    expect(getDateRange("unknown", today)).toBeNull();
  });
});
