import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// Una commessa con un ordine d'acquisto e la sua bolla, più una bolla caricata
// dall'ufficio sulla commessa senza ordine.
const DATI: Record<string, (filtri: Record<string, unknown>) => unknown[]> = {
  purchase_orders: () => [{ id: "po1", oda_number: "ODA-001", suppliers: { name: "Aluplast" } }],
  ddt_ricezione: (f) => f.order_id
    ? [{ id: "d2", purchase_order_id: null, numero_ddt: "B-77", data_ricezione: "2026-10-29", stato: "verificato", has_damages: false, non_conformita: null, suppliers: { name: "Edil Forniture" } }]
    : [{ id: "d1", purchase_order_id: "po1", numero_ddt: "DDT-043", data_ricezione: "2026-09-24", stato: "verificato", has_damages: false, non_conformita: null }],
  campo_acquisti: () => [],
  documenti_fiscali: () => [],
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabella: string) => {
      const filtri: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, order: () => q, is: () => q, neq: () => q,
        eq: (k: string, v: unknown) => { filtri[k] = v; return q; },
        in: (k: string, v: unknown) => { filtri[k] = v; return q; },
        range: () => Promise.resolve({ data: (DATI[tabella] ?? (() => []))(filtri), error: null }),
      });
      return q;
    },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "co" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: false, canEditWarehouse: true }) }));
vi.mock("@/components/ddt/NewDDTDialog", () => ({
  NewDDTDialog: (p: { open: boolean; prefillOrderId?: string; restaQui?: boolean }) =>
    p.open ? <div role="dialog">Nuova bolla per {p.prefillOrderId} {p.restaQui ? "resta qui" : ""}</div> : null,
}));
import { OrderBolleDdtCard } from "@/components/orders/OrderDocumentiFornitore";

describe("Bolle della commessa", () => {
  it("mostra anche la bolla caricata sulla commessa senza ordine d'acquisto, col suo fornitore", async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><OrderBolleDdtCard orderId="o1" /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText(/N° B-77/)).toBeInTheDocument();
    expect(screen.getByText("Edil Forniture")).toBeInTheDocument();
    expect(screen.getByText(/N° DDT-043/)).toBeInTheDocument();
    expect(screen.getByText("Aluplast · ODA-001")).toBeInTheDocument();
  });

  it("«Carica bolla» apre il popup già sulla commessa, e dopo si resta qui", async () => {
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><OrderBolleDdtCard orderId="o1" /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /Carica bolla/ }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Nuova bolla per o1 resta qui");
  });
});
