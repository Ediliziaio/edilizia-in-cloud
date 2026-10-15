import { describe, it, expect } from "vitest";
import { parseEconomicsReport } from "@/lib/companyEconomicsSchema";
import {
  companyEconomics,
  providerPeriodCost,
  economicsCsv,
  type EconomicsReport,
  type ProviderCostSnapshot,
} from "@/lib/companyEconomics";
const provider: ProviderCostSnapshot = {
  id: "supabase",
  label: "Supabase",
  kind: "cycle",
  period_start: "2026-10-12T00:00:00Z",
  period_end: "2026-11-12T00:00:00Z",
  observed_at: "2026-10-15T09:00:00Z",
  current_amount: 25,
  forecast_amount: 76,
  currency: "USD",
  eur_per_unit: 0.9,
  fx_date: "2026-10-14",
  source_url: "https://supabase.com",
  last_invoice_amount: 73.39,
  last_invoice_date: "2026-10-12",
  note: "",
};
export function report(): EconomicsReport {
  return {
    measured_at: "2026-10-15T09:00:00Z",
    period_start: provider.period_start,
    period_end: provider.period_end,
    companies: [
      {
        id: "a",
        name: "Gratis",
        status: "active",
        payment_method: "comped",
        created_at: "2026-01-01",
        plan_name: "Pro",
        plan_monthly_eur: 247,
        custom_monthly_eur: null,
        override_expires_at: null,
      },
      {
        id: "b",
        name: "Pagante",
        status: "active",
        payment_method: "stripe",
        created_at: "2026-01-01",
        plan_name: "Pro",
        plan_monthly_eur: 247,
        custom_monthly_eur: null,
        override_expires_at: null,
      },
    ],
    costs: [
      {
        company_id: "a",
        kind: "ai",
        events: 3,
        recorded_eur: 2,
        missing_events: 0,
        estimated_events: 1,
      },
      {
        company_id: null,
        kind: "ai",
        events: 1,
        recorded_eur: 100,
        missing_events: 0,
        estimated_events: 0,
      },
    ],
    providers: [{ ...provider }],
    storage: [],
    legacy_ai: { events: 3, recorded_eur: 900, note: "non sommare" },
  };
}
describe("Economia azienda: costi e margine trasparenti", () => {
  it("converte solo la rilevazione corrente e non la previsione o vecchia fattura", () => {
    const r = report();
    expect(companyEconomics(r, "a")?.shared).toBe(11.25);
    expect(providerPeriodCost(provider, r, true)).toBe(68.4);
  });
  it("attribuisce i costi anche agli omaggi mantenendo il canone a zero", () => {
    const value = companyEconomics(report(), "a")!;
    expect(value.mrr).toBe(0);
    expect(value.margin).toBe(-13.25);
    expect(value.partial).toBe(true);
  });
  it("non duplica AI secondaria e non scarica i costi senza azienda sui clienti", () => {
    const value = companyEconomics(report(), "a")!;
    expect(value.direct).toBe(2);
    expect(value.knownCost).toBe(13.25);
  });
  it("riconcilia il riparto uniforme senza arrotondare prematuramente", () => {
    const r = report();
    r.providers[0].current_amount = 1;
    const total = r.companies.reduce(
      (sum, c) => sum + companyEconomics(r, c.id)!.shared!,
      0,
    );
    expect(total).toBeCloseTo(0.9, 10);
  });
  it("conserva il denominatore prima di qualunque ricerca visuale", () =>
    expect(companyEconomics(report(), "a")?.denominator).toBe(2));
  it("un cambio mancante rende costi comuni e margine non disponibili", () => {
    const r = report();
    r.providers[0].eur_per_unit = null;
    expect(companyEconomics(r, "a")?.margin).toBeNull();
    expect(companyEconomics(r, "a")?.knownCost).toBeNull();
  });
  it("il piano gratuito verificato non richiede conversione valutaria", () => {
    const r = report();
    r.providers[0] = {
      ...provider,
      kind: "free",
      current_amount: 0,
      eur_per_unit: null,
    };
    expect(companyEconomics(r, "a")?.shared).toBe(0);
  });
  it("non interpreta provider mancanti come infrastruttura gratis", () => {
    const r = report();
    r.providers = [];
    expect(companyEconomics(r, "a")?.margin).toBeNull();
  });
  it("non utilizza una fattura di un altro periodo come costo corrente", () => {
    const r = report();
    r.providers[0].period_start = "2026-09-12T00:00:00Z";
    expect(companyEconomics(r, "a")?.shared).toBeNull();
  });
  it("ripartisce il dominio annuale per giorni e limita la quota a fine periodo", () => {
    const r = report();
    r.providers[0] = {
      ...provider,
      kind: "annual",
      current_amount: 365,
      currency: "EUR",
      period_start: "2026-01-01T00:00:00Z",
      period_end: "2027-01-01T00:00:00Z",
    };
    expect(providerPeriodCost(r.providers[0], r)).toBe(3.375);
    expect(providerPeriodCost(r.providers[0], r, true)).toBe(31);
  });
  it("tiene distinti canone attuale ed override scaduto", () => {
    const r = report();
    r.companies[1].custom_monthly_eur = 99;
    r.companies[1].override_expires_at = "2026-10-14";
    expect(companyEconomics(r, "b")?.mrr).toBe(247);
    r.companies[1].override_expires_at = "2026-11-01";
    expect(companyEconomics(r, "b")?.mrr).toBe(99);
  });
  it("non inventa il canone di un pagante senza piano", () => {
    const r = report();
    r.companies[1].plan_monthly_eur = null;
    expect(companyEconomics(r, "b")?.mrr).toBeNull();
    expect(companyEconomics(r, "b")?.margin).toBeNull();
  });
  it("trial e sospesi hanno canone nullo ma conservano i costi", () => {
    for (const status of ["trial", "suspended", "expired"]) {
      const r = report();
      r.companies[1].status = status;
      expect(companyEconomics(r, "b")?.mrr).toBe(0);
      expect(companyEconomics(r, "b")?.shared).toBe(11.25);
    }
  });
  it("una società fuori rilevazione non eredita valori da un’altra", () =>
    expect(companyEconomics(report(), "missing")).toBeNull());
  it("CSV completo include qualità e protegge formule nei nomi", () => {
    const r = report();
    r.companies[0].name = '=HYPERLINK("url")';
    const csv = economicsCsv(r);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("Parziale");
    expect(csv).toContain("Pagante");
  });
  it("valida la forma della rilevazione senza sostituire dati mancanti con zero", () => {
    const r = report();
    expect(parseEconomicsReport(r).companies).toHaveLength(2);
    expect(() => parseEconomicsReport({ ...r, costs: undefined })).toThrow(
      "incompleta",
    );
    expect(() => parseEconomicsReport({ ...r, providers: [] })).toThrow(
      "incompleta",
    );
    expect(() =>
      parseEconomicsReport({ ...r, measured_at: "2026-12-01" }),
    ).toThrow("incompleta");
  });
});
