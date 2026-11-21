import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { usePermissions } from "@/hooks/usePermissions";

const fixture = vi.hoisted(() => {
  const responses = new Map<string, { data: Record<string, unknown> | null; error: Error | null }>();
  return { responses, auth: { user: { id: "utente" }, role: "company_staff", effectiveCompany: { id: "a" }, multiCompanyAccesses: [] as unknown[] } };
});

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => fixture.auth }));
vi.mock("@/hooks/accountant/useAccountantPortalData", () => ({ useCurrentCommercialistaAccessMode: (): { data: null } => ({ data: null }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let company = "";
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          if (key === "company_id") company = value;
          return query;
        },
        abortSignal: () => query,
        returns: () => query,
        maybeSingle: async () => fixture.responses.get(company) ?? { data: null, error: null },
      };
      return query;
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: (): void => undefined,
  },
}));

it("distingue un errore durante il cambio azienda, una rilettura riuscita e una riga assente", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  fixture.responses.set("a", { data: { can_view_orders: true, can_view_order_amounts: true }, error: null });
  fixture.responses.set("b", { data: null, error: new Error("Errore del servizio") });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender, unmount } = renderHook(() => usePermissions(), { wrapper });

  try {
    await waitFor(() => expect(result.current.canViewOrders).toBe(true));
    expect(result.current.canViewOrderAmounts).toBe(true);
    fixture.auth.effectiveCompany = { id: "b" };
    rerender();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canViewOrderAmounts).toBe(false);
    expect(result.current.canViewOrderPaymentStatus).toBe(false);
    expect(result.current.loadError).toBe("Errore del servizio");

    fixture.responses.set("b", { data: { can_view_orders: true, can_view_order_amounts: false, can_view_order_payment_status: true }, error: null });
    await act(() => client.invalidateQueries({ queryKey: ["staff-permissions", "utente", "b"] }));
    await waitFor(() => expect(result.current.canViewOrderPaymentStatus).toBe(true));
    expect(result.current.canViewOrderAmounts).toBe(false);
    expect(result.current.loadError).toBeFalsy();

    fixture.auth.effectiveCompany = { id: "c" };
    rerender();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadError).toBeFalsy();
    expect(result.current.canViewOrders).toBe(false);
    expect(result.current.canViewOrderAmounts).toBe(false);
  } finally {
    unmount();
    client.clear();
  }
});
