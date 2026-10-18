import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" }, user: { id: "u1" } }) }));
vi.mock("@/contexts/BillingModeContext", () => ({ useBillingMode: () => ({ isNative: true }) }));
vi.mock("@/hooks/useShipmentDDTPDF", () => ({ useShipmentDDTPDF: () => ({ generate: vi.fn() }) }));
vi.mock("@/hooks/useMaterialProcurement", () => ({ useMaterialProcurement: () => ({ isPending: true, isError: false, data: undefined as unknown }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "or", "order", "limit", "range", "neq", "not", "ilike", "gt", "filter"]) q[m] = () => q;
    q.maybeSingle = q.single = () => Promise.resolve({ data: null as unknown, error: null as unknown });
    q.then = (si: (r: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve({ data: [] as unknown[], error: null as unknown }).then(si, no);
    return q;
  },
  storage: { from: () => ({}) },
} }));
vi.mock("@/hooks/warehouse/useWarehouseUscita", async (orig) => {
  const vero = await orig<typeof import("@/hooks/warehouse/useWarehouseUscita")>();
  return {
    ...vero,
    useCreateDdtFromUscita: () => ({ mutateAsync: vi.fn() }),
    useUsciteByOrder: () => ({ isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), data: [{
      id: "u1", numero: "USC-1", data: "2026-10-10", destinatario_tipo: "cantiere", order_id: "o1",
      stato: "registrata", created_at: "2026-10-10",
      righe: [{ descrizione: "Cemento", quantita: 10, prezzo_unitario: 12.5 }],
    }] as unknown as import("@/hooks/warehouse/useWarehouseUscita").UscitaRow[] }),
  };
});

import { OrderUsciteCard } from "@/components/orders/OrderUsciteCard";
import { OrderItemsList, type OrderItem } from "@/components/orders/OrderItemsList";

const avvolgi = (figlio: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{figlio}</MemoryRouter>
  </QueryClientProvider>,
);
afterEach(cleanup);

const voce: OrderItem = {
  id: "i1", name: "Serramento PVC", quantity: 2, status: "da_ordinare", position: 0,
  purchase_price: 310, standard_cost: 300, vat_rate: 22,
  payment_method: "50_50", deposit_amount: 300, balance_amount: 320,
};

describe("uscite di magazzino nel dettaglio commessa", () => {
  it("con il permesso mostra il valore delle uscite", () => {
    avvolgi(<OrderUsciteCard orderId="o1" canViewCosts />);
    expect(screen.getAllByText(/125,00/).length).toBeGreaterThan(0);
  });
  it("senza il permesso mostra numero, data e articoli, senza importi", () => {
    const { container } = avvolgi(<OrderUsciteCard orderId="o1" />);
    expect(screen.getByText("USC-1")).toBeInTheDocument();
    expect(screen.getByText(/1 articolo/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/€|125/);
  });
});

describe("articoli della commessa", () => {
  it("con il permesso mostra costo d'acquisto, listino, acconto e saldo", () => {
    avvolgi(<OrderItemsList items={[voce]} onItemsChange={vi.fn()} editable={false} />);
    expect(screen.getAllByText(/620,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Listino:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Acconto:/).length).toBeGreaterThan(0);
  });
  it("senza il permesso mostra l'articolo senza cifre di costo", () => {
    const { container } = avvolgi(<OrderItemsList items={[voce]} onItemsChange={vi.fn()} editable={false} canViewCosts={false} />);
    expect(screen.getAllByText("Serramento PVC").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Listino:/)).toBeNull();
    expect(screen.queryByText(/Acconto:/)).toBeNull();
    expect(container.textContent).not.toMatch(/620|600|300,00|320,00/);
  });
});

describe("finestra di modifica dell'articolo", () => {
  it("salvare non azzera il prezzo di vendita della riga", () => {
    const onItemsChange = vi.fn();
    avvolgi(<OrderItemsList items={[{ ...voce, unit_price: 450, discount_percent: 5 }]} onItemsChange={onItemsChange} editable canViewCosts />);
    fireEvent.click(screen.getAllByLabelText("Modifica")[0]);
    fireEvent.click(screen.getByText("Salva modifiche"));
    expect(onItemsChange.mock.calls[0][0][0]).toMatchObject({ unit_price: 450, discount_percent: 5 });
  });

  const apri = (canViewCosts: boolean, onItemsChange = vi.fn()) => {
    avvolgi(<OrderItemsList items={[voce]} onItemsChange={onItemsChange} editable canViewCosts={canViewCosts} />);
    // In modifica la sezione «Altri dettagli» (pagamento, acconto, saldo) si apre già aperta.
    fireEvent.click(screen.getAllByLabelText("Modifica")[0]);
    return screen.getByRole("dialog");
  };

  it("con il permesso mostra costo d'acquisto, totale riga, acconto e saldo", () => {
    const finestra = apri(true);
    expect(finestra.textContent).toMatch(/Costo Acquisto/);
    expect(finestra.textContent).toMatch(/Totale riga/);
    expect(finestra.textContent).toMatch(/310,00/);
    expect(finestra.textContent).toMatch(/Acconto \(50%\)310,00/);
  });

  it("senza il permesso nasconde costi, listino, totale riga, acconto e saldo", () => {
    const finestra = apri(false);
    expect(finestra.textContent).not.toMatch(/Costo Acquisto|Totale riga|Costo base materiale|Listino /);
    expect(finestra.textContent).not.toMatch(/€|310|300,00|620/);
    expect(finestra.textContent).toMatch(/Acconto \(50%\)/);
  });

  it("senza il permesso, salvare non cambia i costi già registrati", () => {
    const onItemsChange = vi.fn();
    apri(false, onItemsChange);
    fireEvent.click(screen.getByText("Salva modifiche"));
    expect(onItemsChange).toHaveBeenCalledTimes(1);
    expect(onItemsChange.mock.calls[0][0][0]).toMatchObject({
      purchase_price: 310, standard_cost: 300, deposit_amount: 310, balance_amount: 310, quantity: 2,
    });
  });
});
