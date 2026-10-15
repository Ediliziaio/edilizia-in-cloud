import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyAddonsSection } from "@/components/admin/company/CompanyAddonsSection";
import type { Company } from "@/types/auth";

const state = vi.hoisted(() => ({ included: true }));
vi.mock("@/hooks/useIncludedWhitelabel", () => ({ useIncludedWhitelabel: () => ({ isIncluded: state.included, planName: state.included ? "Pro" : "Starter" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
afterEach(cleanup);
function open(included: boolean) {
  state.included = included;
  const company = { id: "company-1", subscription_plan_id: "plan-1", white_label_enabled: true, white_label_monthly_price: 49, white_label_enabled_at: null } as Company;
  render(<QueryClientProvider client={new QueryClient()}><CompanyAddonsSection company={company} /></QueryClientProvider>);
}
describe("White Label incluso nel piano", () => {
  it("Pro mostra incluso senza supplemento e senza interruttore manuale", () => {
    open(true);
    expect(screen.getByText("INCLUSO NEL PIANO")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeChecked();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.queryByText("Prezzo mensile:")).toBeNull();
  });
  it("un add-on manuale su Starter conserva la gestione del prezzo", () => {
    open(false);
    expect(screen.getByRole("switch")).toBeEnabled();
    expect(screen.getByText("Prezzo mensile:")).toBeInTheDocument();
  });
});
