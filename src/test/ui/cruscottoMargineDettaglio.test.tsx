import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DrilldownDrawer } from "@/components/cruscotto/DrilldownDrawer";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az1" } }) }));

// DEMO-2024-H015 di Demo 2 com'era il 29/10/2026: nella vista 25,8%; la vecchia
// formula del dettaglio (articoli previsti + ditte IVA inclusa) diceva 22,0%.
const COMMESSE = [
  { id: "o1", order_code: "DEMO-2024-H015", description: null as string | null },
  { id: "o2", order_code: "KB-001", description: null },
];
const VISTA = [
  { id: "o1", preventivo_totale: 250267.38, consuntivo: 185669.67, margine: 64597.71, margine_perc: 25.8 },
  { id: "o2", preventivo_totale: 18000, consuntivo: 0, margine: 18000, margine_perc: 100 },
];
const tabelleLette: string[] = [];
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      tabelleLette.push(tabella);
      const dati = tabella === "orders" ? COMMESSE : VISTA;
      const q = {
        select: () => q, eq: () => q, or: () => q, is: () => q, gte: () => q, lte: () => q, order: () => q,
        limit: () => Promise.resolve({ data: dati, error: null }),
        in: () => Promise.resolve({ data: dati, error: null }),
      };
      return q;
    },
  },
}));

describe("Dettaglio «Margine» del cruscotto", () => {
  it("mostra i numeri della scheda commessa, dalla stessa vista", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <DrilldownDrawer type="margin" onClose={() => {}} dateFrom={new Date("2026-01-01")} dateTo={new Date("2026-12-31")} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("25.8%")).toBeTruthy();
    expect(tabelleLette).toContain("v_ordine_marginalita");
    expect(screen.queryByText("22.0%")).toBeNull();
  });

  it("una commessa senza costi non mostra un margine del 100%", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <DrilldownDrawer type="margin" onClose={() => {}} dateFrom={new Date("2026-01-01")} dateTo={new Date("2026-12-31")} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Costi da registrare")).toBeTruthy();
    expect(screen.queryByText("100.0%")).toBeNull();
  });
});
