import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  reads: [] as { table: string; filters: [string, unknown][] }[],
  writes: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    role: "company_staff",
    effectiveCompany: { id: "company" },
    user: { id: "user" },
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ canEditOrders: false, canViewCosts: false }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: state.writes,
    from: (table: string) => {
      const read = { table, filters: [] as [string, unknown][] };
      const q: Record<string, unknown> = {};
      for (const method of ["select", "order", "in"]) q[method] = () => q;
      q.eq = (key: string, value: unknown) => {
        read.filters.push([key, value]);
        return q;
      };
      q.then = (yes: (r: unknown) => unknown) => {
        state.reads.push(read);
        return Promise.resolve({ data: [], error: null }).then(yes);
      };
      q.insert = state.writes;
      q.update = state.writes;
      return q;
    },
  },
}));
import { OrdineRapportiniCampo } from "@/components/orders/OrdineRapportiniCampo";
beforeEach(() => {
  state.reads = [];
  vi.clearAllMocks();
});
afterEach(cleanup);
describe("report approval filter integration", () => {
  it.each([true, false])(
    "keeps the pending-only cache separate while preserving the standard list (pending: %s)",
    async (pending) => {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <OrdineRapportiniCampo
            orderId="order"
            azioniInRiga
            soloDaApprovare={pending}
          />
        </QueryClientProvider>,
      );
      await waitFor(() =>
        expect(state.reads.some((r) => r.table === "campo_rapportini")).toBe(
          true,
        ),
      );
      const report = state.reads.find((r) => r.table === "campo_rapportini")!;
      expect(report.filters).toContainEqual(["company_id", "company"]);
      expect(report.filters).toContainEqual(["order_id", "order"]);
      if (pending) expect(report.filters).toContainEqual(["stato", "inviato"]);
      else expect(report.filters.some(([key]) => key === "stato")).toBe(false);
      expect(
        await screen.findByText(
          pending
            ? "Nessun rapportino da approvare"
            : "Nessun rapportino caricato dagli operai",
        ),
      ).toBeVisible();
      expect(
        client.getQueryData([
          "order-campo-rapportini",
          "order",
          "company",
          ...(pending ? ["da-approvare"] : []),
        ]),
      ).toEqual([]);
      expect(state.writes).not.toHaveBeenCalled();
    },
  );
});
