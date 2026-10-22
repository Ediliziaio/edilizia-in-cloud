import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ ranges: [] as number[] }));
const vista = Array.from({ length: 1001 }, (_, i) => ({
  order_item_id: `r${i}`, order_id: i === 0 ? "cancellata" : "job", article_template_id: null as unknown, categoria: "materiali",
  name: i === 1 ? "FINESTRA 1 ANTA" : "Mattoni", costo_standard: 0, costo_reale: i === 1 ? 1480 : 10, fonte_costo: "oda", ha_baseline_listino: false,
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "demo" }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    let ids: string[] = [];
    const b = {
      select: () => b, eq: () => b, gte: () => b, lt: () => b, order: () => b,
      range: async (from: number, to: number) => { state.ranges.push(from); return { data: vista.slice(from, to + 1), error: null as unknown }; },
      in: async (_c: string, v: string[]) => {
        ids = v;
        if (table !== "order_items") return { data: [], error: null };
        return { data: ids.map((id) => ({
          id, unit_price: id === "r1" ? 0 : 15, quantity: 1, discount_percent: 0,
          supplier: { name: "Edilmateriali" }, phase: { name: "Opere murarie" },
          order: { deleted_at: id === "r0" ? "2026-05-01" : null },
        })), error: null as unknown };
      },
    };
    return b;
  };
  return { supabase: { from: builder } };
});
vi.mock("@/components/controllo-gestione/ui/ExportButton", () => ({ ExportButton: (): null => null }));
import { TabProdotti } from "@/components/controllo-gestione/tabs/TabProdotti";

afterEach(cleanup);

describe("scheda Prodotti & Categorie", () => {
  it("legge oltre mille righe, esclude le commesse cancellate, raggruppa per fase e tiene a parte i costi senza preventivo", async () => {
    render(<QueryClientProvider client={new QueryClient()}><TabProdotti anno={2026} /></QueryClientProvider>);
    expect((await screen.findAllByText("Opere murarie")).length).toBeGreaterThan(0);
    expect(state.ranges).toEqual([0, 500, 1000]);
    // 1001 righe − 1 cancellata = 1000; 999 vendute a 15 con costo 10.
    expect(screen.getByText(/1000 righe/)).toBeInTheDocument();
    expect(screen.getAllByText("14.985,00 €").length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/1\.480,00\s€ di costi su 1 riga senza prezzo di vendita/);
    expect(document.body.textContent).toContain("33,3%");
  });
});
