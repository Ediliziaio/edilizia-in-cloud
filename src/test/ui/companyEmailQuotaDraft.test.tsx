import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanyEmailTab } from "@/components/admin/company/CompanyEmailTab";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
const state = vi.hoisted(() => ({
  quota: {
    company_id: "demo",
    plan_name: "Pro",
    plan_limit: 0,
    plan_price_eur: 0.0012,
    effective_limit: 0,
    effective_price_eur: 0.0012,
    override_limit: null,
    override_price_eur: null,
    is_free: false,
    sent_this_month: 0,
    remaining: 0,
    over_quota: true,
    wallet_balance_eur: 0,
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "admin" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async (name: string) => ({
      data:
        name === "get_company_email_quota"
          ? { ...state.quota }
          : { per_month: [], per_stream_current_month: [] },
      error: null,
    }),
    functions: {
      invoke: async () => ({ data: { domain: null }, error: null }),
    },
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        then: (fn: any) => Promise.resolve({ data: [], error: null }).then(fn),
      };
      return q;
    },
  },
}));
afterEach(cleanup);
function open() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ConfirmProvider>
        <CompanyEmailTab companyId="demo" companyName="Demo" />
      </ConfirmProvider>
    </QueryClientProvider>,
  );
  return client;
}
describe("Quote email e bozze", () => {
  it("una quota zero descrive il consumo senza falso esaurimento", async () => {
    open();
    expect(
      await screen.findByText(/Nessuna email inclusa/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Oltre quota — addebito attivo")).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("un refetch non cancella la quota in modifica", async () => {
    const client = open();
    await screen.findByRole("heading", { name: "Utilizzo mese corrente" });
    fireEvent.change(screen.getAllByRole("spinbutton")[0], {
      target: { value: "120" },
    });
    await act(async () => {
      await client.invalidateQueries({
        queryKey: ["company-email-quota", "demo"],
      });
    });
    expect(screen.getAllByRole("spinbutton")[0]).toHaveValue(120);
  });
});
