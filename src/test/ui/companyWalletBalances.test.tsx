import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreditManagerCard } from "@/components/admin/company/CreditManagerCard";
import { queryKeys } from "@/lib/queryKeys";
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data:
            table === "render_credits"
              ? { balance: 3 }
              : table === "sms_wallet"
                ? { crediti: 0 }
                : { balance_eur: 0 },
          error: null,
        }),
      };
      return q;
    },
  },
}));
afterEach(cleanup);
describe("Wallet azienda", () => {
  it("ignora le cache di altri componenti con forma diversa e blocca deduzioni a saldo zero", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(queryKeys.admin.emailCredits("demo"), {
      balance_eur: 100,
    });
    client.setQueryData(queryKeys.admin.aiCreditsAdmin("demo"), {
      balance_eur: 100,
    });
    render(
      <QueryClientProvider client={client}>
        <CreditManagerCard companyId="demo" />
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { name: "Gestione Crediti" });
    const deduct = screen.getAllByRole("button", {
      name: "Deduci",
      exact: true,
    });
    expect(deduct).toHaveLength(5);
    expect(deduct[0]).toBeDisabled();
    expect(deduct[1]).toBeDisabled();
    expect(deduct[2]).toBeDisabled();
    expect(deduct[3]).toBeEnabled();
    expect(deduct[4]).toBeDisabled();
  });
});
