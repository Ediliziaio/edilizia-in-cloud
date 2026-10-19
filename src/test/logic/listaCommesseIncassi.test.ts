import { describe, expect, it } from "vitest";
import { getAmountCollected, getAmountDue, getGrossOrderAmount, type OrderWithDetails } from "@/lib/orderUtils";

// Lista commesse con le stesse regole della scheda: varianti nel totale, fatture pagate in parte,
// saldo pagato con le varianti fino al giorno del pagamento.
const base = {
  id: "o", total_amount: 86000, vat_rate: 10, payment_type: "standard", financing_cost: 0,
  deposit_amount: 0, balance_amount: 0, deposit_paid: false, balance_paid: false,
} as unknown as OrderWithDetails;

describe("lista commesse: incassato e da ricevere", () => {
  it("il totale conta le varianti approvate", () => {
    const order = { ...base, variazioni: [
      { status: "approvato", impatto_economico: 3500 },
      { status: "in_attesa", impatto_economico: 9999 },
    ] } as OrderWithDetails;
    expect(getGrossOrderAmount(order)).toBe(98450);
  });

  it("una fattura pagata in parte conta per quanto è entrato", () => {
    const order = { ...base, total_amount: 17500, installments: [
      { position: 0, type: "deposit", amount: 5775, is_paid: true },
      { position: 1, type: "balance", amount: 13475, is_paid: false, fattura: { id: "f", importo_pagato: 5390 } },
    ] } as OrderWithDetails;
    expect(getAmountCollected(order)).toBe(11165);
    expect(getAmountDue(order)).toBe(8085);
  });

  it("il saldo pagato non cresce con una variante approvata dopo", () => {
    const order = { ...base, total_amount: 10000, installments: [
      { position: 0, type: "deposit", amount: 4000, is_paid: true, paid_date: "2026-05-01" },
      { position: 1, type: "balance", amount: 0, is_paid: true, paid_date: "2026-07-01" },
    ], variazioni: [{ status: "approvato", impatto_economico: 2000, approval_recorded_at: "2026-08-01T10:00:00+00:00" }] } as OrderWithDetails;
    expect(getAmountCollected(order)).toBe(11000);
    expect(getAmountDue(order)).toBe(2200);
  });
});
