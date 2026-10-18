import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({}) }));

import { buildMonthBuckets, getNormalizedOrderAmounts, type DashboardInstallmentRow } from "@/hooks/useCompanyDashboardData";

type Commessa = Parameters<typeof getNormalizedOrderAmounts>[0];
const commessa = (patch: Record<string, unknown> = {}): Commessa => ({
  id: "o1", customer_id: null, created_at: null, current_status_id: null,
  total_amount: 10000, vat_rate: 22,
  deposit_amount: null, deposit_paid: null, deposit_2_amount: null, deposit_2_paid: null,
  balance_amount: null, balance_paid: null, financing_amount: null, financing_paid: null,
  payment_type: "standard", financing_cost: null,
  ...patch,
} as Commessa);

describe("riepilogo azienda: incassato e da incassare, tutto IVA inclusa", () => {
  it("con un acconto pagato: incassato lordo, da incassare = totale ivato meno incassato", () => {
    const rate = new Map<string, DashboardInstallmentRow[]>([["o1", [
      { type: "deposit", position: 0, amount: 3660, is_paid: true },
      { type: "balance", position: 1, amount: 8540, is_paid: false },
    ]]]);
    const r = getNormalizedOrderAmounts(commessa(), rate);
    expect(r.commercialTotal).toBe(10000);
    expect(r.collected).toBe(3660);
    expect(r.due).toBeCloseTo(12200 - 3660, 2);
  });

  it("tutto incassato: niente da incassare (prima restavano 2.200 di IVA, o l'incassato era tagliato all'imponibile)", () => {
    const rate = new Map<string, DashboardInstallmentRow[]>([["o1", [
      { type: "deposit", position: 0, amount: 3660, is_paid: true },
      { type: "balance", position: 1, amount: 8540, is_paid: true },
    ]]]);
    const r = getNormalizedOrderAmounts(commessa(), rate);
    expect(r.collected).toBeCloseTo(12200, 2);
    expect(r.due).toBe(0);
  });

  it("a finanziamento toglie il costo della finanziaria dal totale da incassare", () => {
    const r = getNormalizedOrderAmounts(commessa({ payment_type: "financing", financing_cost: 200 }), new Map([["o1", [
      { type: "financing", position: 0, amount: 12000, is_paid: false },
      { type: "balance", position: 1, amount: 0, is_paid: false },
    ]]]));
    expect(r.collected).toBe(0);
    expect(r.due).toBeCloseTo(12000, 2);
  });

  it("senza rate usa le colonne-riassunto della commessa", () => {
    const r = getNormalizedOrderAmounts(commessa({ deposit_amount: 1220, deposit_paid: true, balance_amount: 10980, balance_paid: false }));
    expect(r.collected).toBe(1220);
    expect(r.due).toBeCloseTo(10980, 2);
  });
});

describe("riepilogo azienda: grafico mensile e lettura delle commesse", () => {
  it("con «Sempre» il grafico mostra gli ultimi 18 mesi fino a oggi", () => {
    const mesi = buildMonthBuckets(new Date(2000, 0, 1), new Date(2026, 9, 18));
    expect(mesi).toHaveLength(18);
    expect(mesi[0].key).toBe("2025-05");
    expect(mesi[17].key).toBe("2026-10");
  });

  it("con un periodo breve il grafico parte dal suo primo mese", () => {
    const mesi = buildMonthBuckets(new Date(2026, 6, 15), new Date(2026, 9, 18));
    expect(mesi.map(m => m.key)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
  });

  it("le commesse si leggono a pagine, ordinate per id", () => {
    const src = readFileSync(resolve(process.cwd(), "src/hooks/useCompanyDashboardData.ts"), "utf8");
    const lettura = src.slice(src.indexOf("const ordersQuery"), src.indexOf("const costsQuery"));
    expect(lettura).toContain("readAllOrderRows<DashboardFinancialOrderRow>");
    expect(lettura).toContain('.order("id").range(da, a)');
  });
});
