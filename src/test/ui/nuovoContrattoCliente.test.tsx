/** «Nuovo contratto» dalla scheda del cliente: si sceglie la commessa e il contratto si apre lì (09/11/2026). */
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { NuovoContrattoClienteDialog } from "@/components/clients/NuovoContrattoClienteDialog";

const righe = vi.hoisted(() => ({ valore: [] as Array<{ id: string; order_code: string; description: string }>, preventivi: [] as Array<{ id: string; quote_number: string; title: string; created_at: string }>, moduli: [] as Array<{ id: string; code: string; tipo_intervento: string; created_at: string }> }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "az" } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const tabella = (nome: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order", "or"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: { email: "g@x.it" }, error: null as null });
    const esito = { data: nome === "quotes" ? righe.preventivi : nome === "orders" ? righe.valore : righe.moduli.filter((x) => nome === "rst_progetti" && x), error: null as null };
    q.limit = () => q;
    q.then = (ok: (v: unknown) => unknown) => ok(esito);
    return q;
  };
  return { supabase: { from: tabella } };
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
    fireEvent.change(await screen.findByLabelText("Righe del nuovo lavoro"), { target: { value: "lavoro:o1" } });
    fireEvent.click(screen.getByRole("button", { name: /Nuovo lavoro/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("contratto=1&copia_da=o1");
  });
  it("un cliente col preventivo di un anno fa: riparte da lì, senza farne uno nuovo", async () => {
    righe.valore = [];
    righe.preventivi = [{ id: "q1", quote_number: "PRV-2025-7", title: "Bagno", created_at: "2025-11-09T10:00:00Z" }];
    disegna();
    fireEvent.change(await screen.findByLabelText("Righe del nuovo lavoro"), { target: { value: "preventivo:q1" } });
    fireEvent.click(screen.getByRole("button", { name: /Nuovo lavoro/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("contratto=1&copia_preventivo=preventivo%3Aq1");
    expect(screen.getByTestId("dove")).not.toHaveTextContent("quote_id");
    righe.preventivi = [];
  });
  it("anche da un preventivo di un modulo", async () => {
    righe.valore = [];
    righe.moduli = [{ id: "p1", code: "RST-1", tipo_intervento: "Bagno", created_at: "2025-06-01T10:00:00Z" }];
    disegna();
    fireEvent.change(await screen.findByLabelText("Righe del nuovo lavoro"), { target: { value: "modulo:rst:p1" } });
    expect(screen.getByRole("option", { name: /Ristrutturazione · RST-1 · Bagno/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Nuovo lavoro/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("copia_preventivo=modulo%3Arst%3Ap1");
    righe.moduli = [];
  });
  it("oppure il contratto su un lavoro che c'è già", async () => {
    righe.valore = [{ id: "o1", order_code: "SIM-1", description: "Bagno" }];
    disegna();
    await screen.findByLabelText("Righe del nuovo lavoro");
    fireEvent.click(screen.getByRole("button", { name: /^SIM-1/ }));
    expect(screen.getByTestId("dove")).toHaveTextContent("/azienda/ordini/o1?contratto=1");
  });
});
