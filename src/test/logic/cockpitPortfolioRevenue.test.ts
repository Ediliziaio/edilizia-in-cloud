import { describe, expect, it } from "vitest";
import { cockpitPortfolio, type CockpitProfile } from "@/lib/customer-os/cockpitPortfolio";
const profile = (company_id: string, is_at_risk = true): CockpitProfile => ({ company_id, is_at_risk, is_upsell_candidate: false, health_label_latest: "at_risk" });
const company = (id: string, payment_method: string, price: number) => ({ id, status: "active", payment_method, subscription_plans: { price_monthly: price } });
describe("MRR del cockpit Assistenza", () => {
  it("esclude dal MRR le aziende regalate anche quando sono considerate a rischio", () => {
    const result = cockpitPortfolio([profile("paid"), profile("gift")], [company("paid", "bank_transfer", 127), company("gift", "comped", 547)]);
    expect(result.mrrTotal).toBe(127);
    expect(result.mrrAtRisk).toBe(127);
    expect(result.atRisk).toBe(2);
  });
  it("non include aziende tecniche o profili che non fanno parte del portafoglio", () => {
    const result = cockpitPortfolio([profile("paid", false), profile("platform"), profile("missing")], [company("paid", "bank_transfer", 127), { ...company("platform", "bank_transfer", 999), is_platform_admin_company: true }]);
    expect(result.total).toBe(1);
    expect(result.mrrTotal).toBe(127);
    expect(result.atRisk).toBe(0);
    expect(result.mrrAtRisk).toBe(0);
  });
});
