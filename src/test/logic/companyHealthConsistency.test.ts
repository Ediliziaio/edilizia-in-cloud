import { describe, expect, it } from "vitest";
import { buildCompanyHealthMap, companyHealthFactors } from "@/lib/companyHealthConsistency";
import type { ServerHealthScore } from "@/hooks/useHealthScores";
import type { CompanyHealthData } from "@/types/adminRpc";
const server: ServerHealthScore = {
  id: "score", company_id: "company", score: 55, health: "at_risk",
  login_score: 0, orders_score: 15, features_score: 20, team_score: 15,
  engagement_score: 5, churn_risk: 45, signals: [], calculated_at: "2026-10-15T03:40:00Z",
};
const activity: CompanyHealthData = {
  company_id: "company", order_count: 385, user_count: 25, has_customers: true,
  has_staff: true, last_order_date: "2026-12-18T00:00:00Z", orders_last_30d: 0,
};
describe("Coerenza salute aziende", () => {
  it("mantiene il punteggio server anche quando il volume storico suggerisce un'azienda sana", () => {
    const map = buildCompanyHealthMap([activity], [server]);
    expect(map.company.score).toBe(55);
    expect(map.company.health).toBe("at_risk");
    expect(map.company.order_count).toBe(385);
    expect(map.company.serverHealth).toBe(server);
  });
  it("non sostituisce un punteggio assente con un calcolo incompatibile", () => {
    expect(buildCompanyHealthMap([activity], [])).toEqual({});
  });
  it("mantiene il punteggio anche se mancano le statistiche ordini", () => {
    expect(buildCompanyHealthMap([], [server]).company.score).toBe(55);
  });
  it("spiega il punteggio su cento con i cinque fattori della scheda", () => {
    const factors = companyHealthFactors(server);
    expect(factors.reduce((sum, factor) => sum + factor.score, 0)).toBe(server.score);
    expect(factors.reduce((sum, factor) => sum + factor.maxScore, 0)).toBe(100);
    expect(companyHealthFactors(null)).toEqual([]);
  });
});
