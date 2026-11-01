import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const righe = [
  { id: "f1", numero_fattura: "88", data_fattura: "2026-10-12", cedente_ragione_sociale: "Edilcemento", totale_documento: 2440, order_match_confidenza: 0.9,
    costo: { id: "c1", order_id: null, supplier: { tipo: "materiali" } }, suggerito: { id: "o1", order_code: "O-0012", client_name: "Rossi", deleted_at: null } },
  { id: "f2", numero_fattura: "9", data_fattura: "2026-10-10", cedente_ragione_sociale: "TIM", totale_documento: 61, order_match_confidenza: null,
    costo: { id: "c2", order_id: null, supplier: { tipo: "generali" } }, suggerito: null },
  { id: "f3", numero_fattura: "10", data_fattura: "2026-10-09", cedente_ragione_sociale: "Ferramenta", totale_documento: 100, order_match_confidenza: null,
    costo: { id: "c3", order_id: null, supplier: null }, suggerito: null },
];
const aggiornati: unknown[] = [];
const lettura: Record<string, unknown> = {};
for (const m of ["select", "eq", "is", "order"]) lettura[m] = () => lettura;
lettura.limit = () => Promise.resolve({ data: righe, error: null });
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      ...lettura,
      update: (v: unknown) => ({ eq: (_c: string, id: unknown) => ({ is: () => ({ select: () => { aggiornati.push({ v, id }); return Promise.resolve({ data: [{ id }], error: null }); } }) }) }),
    }),
  },
}));
import { FattureDaAssegnare } from "@/components/fatturazione/FattureDaAssegnare";

describe("fatture registrate senza commessa", () => {
  it("conferma la commessa proposta in un clic; le spese generali non si chiedono", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FattureDaAssegnare companyId="a" puoModificare /></QueryClientProvider>);
    expect(await screen.findByText(/2 fatture registrate senza commessa/)).toBeTruthy();
    expect(screen.queryByText("TIM")).toBeNull();
    expect(screen.getByText(/1 senza proposta/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Assegna a O-0012/));
    await waitFor(() => expect(aggiornati).toEqual([{ v: { order_id: "o1" }, id: "c1" }]));
  });
});
