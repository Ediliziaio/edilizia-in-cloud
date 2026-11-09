/** «Nuovo contratto» dalla scheda del cliente: si sceglie la commessa e il contratto si apre lì (09/11/2026). */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NuovoContrattoClienteDialog } from "@/components/clients/NuovoContrattoClienteDialog";

const righe = vi.hoisted(() => ({ valore: [] as Array<{ id: string; order_code: string; description: string }> }));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "order"]) q[m] = () => q;
  q.limit = async () => ({ data: righe.valore, error: null as null });
  return { supabase: { from: () => q } };
});

function Dove() { const l = useLocation(); return <div data-testid="dove">{l.pathname + l.search}</div>; }
const disegna = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><Dove /><NuovoContrattoClienteDialog aperto onChiudi={() => undefined} clienteId="c1" nomeCliente="Giulia Ferrari" /></MemoryRouter>
  </QueryClientProvider>,
);

describe("nuovo contratto dal cliente", () => {
  it("scegliendo la commessa si apre il contratto su quella commessa", async () => {
    righe.valore = [{ id: "o1", order_code: "SIM-COMMITTENTE", description: "Ristrutturazione" }];
    disegna();
    fireEvent.click(await screen.findByText("SIM-COMMITTENTE"));
    expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini/o1?contratto=1");
  });
  it("senza commesse lo dice e porta a crearne una, col cliente già scelto", async () => {
    righe.valore = [];
    disegna();
    expect(await screen.findByText(/non ha ancora commesse/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nuova commessa/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini/nuovo?customer_id=c1&customer_name=Giulia%20Ferrari");
  });
});
