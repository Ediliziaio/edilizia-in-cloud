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
  it("nuovo lavoro: si apre la commessa col cliente e il contratto da preparare", async () => {
    righe.valore = [];
    disegna();
    fireEvent.click(await screen.findByRole("button", { name: /Nuovo lavoro/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini/nuovo?customer_id=c1&customer_name=Giulia%20Ferrari&contratto=1");
  });
  it("si possono riprendere le righe di un lavoro precedente", async () => {
    righe.valore = [{ id: "o1", order_code: "SIM-1", description: "Bagno" }];
    disegna();
    fireEvent.change(await screen.findByLabelText("Righe del nuovo lavoro"), { target: { value: "o1" } });
    fireEvent.click(screen.getByRole("button", { name: /Nuovo lavoro/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("contratto=1&copia_da=o1");
  });
  it("oppure il contratto su un lavoro che c'è già", async () => {
    righe.valore = [{ id: "o1", order_code: "SIM-1", description: "Bagno" }];
    disegna();
    await screen.findByLabelText("Righe del nuovo lavoro");
    fireEvent.click(screen.getByRole("button", { name: /^SIM-1/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini/o1?contratto=1");
  });
});
