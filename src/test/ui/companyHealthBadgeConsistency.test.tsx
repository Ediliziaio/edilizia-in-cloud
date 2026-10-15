import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ServerHealthScore } from "@/hooks/useHealthScores";
import { HealthScoreBadge } from "@/components/admin/company/HealthScoreBadge";
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] as Array<{ score: number; calculated_at: string }> }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
afterEach(cleanup);
function score(value: number, health: string): ServerHealthScore {
  return { id: "score", company_id: "demo", score: value, health, login_score: 0, orders_score: 0, features_score: 0, team_score: 0, engagement_score: 0, churn_risk: 0, signals: [], calculated_at: "2026-10-15T03:40:00Z" };
}
describe("Etichetta di salute comune a elenco e dettaglio", () => {
  it("rispetta lo stato sano del server anche sotto la vecchia soglia locale di 80", () => {
    render(<HealthScoreBadge companyId="demo" healthScore={score(75, "healthy")} />);
    expect(screen.getByText("In salute")).toBeInTheDocument();
    expect(screen.queryByText("A Rischio")).not.toBeInTheDocument();
  });
  it("non riclassifica come critico un account che il server considera a rischio", () => {
    render(<HealthScoreBadge companyId="demo" healthScore={score(33, "at_risk")} />);
    expect(screen.getByText("A Rischio")).toBeInTheDocument();
    expect(screen.queryByText("Critico")).not.toBeInTheDocument();
  });
  it("mantiene esplicita l'assenza di una valutazione", () => {
    render(<HealthScoreBadge companyId="demo" healthScore={null} />);
    expect(screen.getByText("N/D")).toBeInTheDocument();
  });
});
