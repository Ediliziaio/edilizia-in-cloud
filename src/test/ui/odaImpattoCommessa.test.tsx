import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { OdaImpattoCommessaCard } from "@/components/orders/OdaImpattoCommessaCard";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const result = { data: table === "orders" ? { order_code: "DEMO", total_amount: 100 } : [
      { id: "altro", subtotal: 30, total: 36.6, status: "confermato" },
      { id: "corrente", subtotal: 20, total: 24.4, status: "bozza" },
      { id: "bozza", subtotal: 80, total: 97.6, status: "bozza" },
    ], error: null as Error | null };
    const q = { select: () => q, eq: () => q, single: () => Promise.resolve(result), then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
    return q;
  },
} }));

describe("Impatto OdA sulla commessa", () => {
  it("confronta imponibili, esclude altre bozze e non conta due volte l'ordine corrente", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><OdaImpattoCommessaCard odaId="corrente" orderId="commessa" imponibileOrdine={20} statoOrdine="bozza" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText(/50,00.*50%/)).toBeTruthy();
    expect(screen.getByText("Importi al netto dell’IVA.")).toBeTruthy();
    expect(screen.getByText(/30,00/)).toBeTruthy();
    expect(screen.queryByText(/36,60|24,40/)).toBeNull();
    client.clear();
  });
});
