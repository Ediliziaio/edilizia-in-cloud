import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyAICockpit } from "@/components/admin/company/CompanyAICockpit";
import type { Company } from "@/types/auth";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin" } }),
}));
vi.mock("@/hooks/useHealthScores", () => ({
  useCompanyHealthScore: () => ({
    data: {
      score: 8,
      company_id: "demo",
      calculated_at: "2026-10-15T08:00:00Z",
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useCompanyPlanPriceOverride", () => ({
  useCompanyPlanPriceOverride: () => ({ data: null }),
}));
vi.mock("@/lib/customer-os/customerProfile", () => ({
  useCustomerProfile: () => ({
    data: {
      company_id: "demo",
      health_score_latest: 38,
      health_label_latest: "at_risk",
      plan_price_monthly: 247,
      plan_name: "Pro",
      team_size: 2,
    },
    isLoading: false,
  }),
  useCustomerContext: () => ({
    data: { recent_interactions: [], recent_events: [] },
    isLoading: false,
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const result = {
        data:
          table === "health_score_history"
            ? [{ score: 8, calculated_at: "2026-10-15T08:00:00Z" }]
            : [],
        error: null,
      };
      const q: any = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        lte: () => q,
        order: () => q,
        limit: () => q,
        then: (fn: any) => Promise.resolve(result).then(fn),
      };
      return q;
    },
  },
}));
afterEach(cleanup);
describe("Analisi AI coerente con il riepilogo", () => {
  it("mostra lo score aziendale e distingue il listino dal MRR gratuito", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <CompanyAICockpit
          companyId="demo"
          company={{ status: "active", payment_method: "comped" } as Company}
          currentPlan={{ name: "Pro", price_monthly: 247 }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText("8", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("38", { exact: true })).toBeNull();
    expect(screen.getByText(/MRR effettivo/)).toHaveTextContent("0,00");
    expect(screen.getByText(/Listino:/)).toHaveTextContent("247,00");
    expect(
      await screen.findByRole("heading", {
        name: "Health Score · ultimi 1 snapshot",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle(/8 \(Critico\)/)).toBeInTheDocument();
  });
});
