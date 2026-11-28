import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";

const fake = vi.hoisted(() => ({ rpc: vi.fn(), rate: [] as Record<string, unknown>[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: fake.rpc, from: () => {
  const q: Record<string, unknown> = {}; q.select = () => q; q.eq = () => q; q.neq = () => q;
  q.order = async (): Promise<{ data: Record<string, unknown>[]; error: null }> => ({ data: fake.rate, error: null }); return q; } } }));
vi.mock("@/hooks/useContiPrimaNota", () => ({ useContiPrimaNota: () => ({ data: [] as unknown[], isError: false, isFetching: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewCosts: true, solaLettura: false, canViewTesoreria: false, canManagePayments: true, isAdmin: true }) }));
Element.prototype.scrollIntoView ??= () => {};

beforeEach(() => {
  fake.rpc.mockReset(); vi.stubGlobal("BroadcastChannel", undefined);
  fake.rpc.mockImplementation(async (name: string) => {
    if (name === "dettaglio_pagamento_costo") return { data: { id: "cost", company_id: "c1", nome: "Fattura", totale: 1000, pagato: 0, residuo: 1000, da_verificare: false, puo_registrare_pagamento: true, movimenti: [] }, error: null };
    if (name === "effetti_elenco") return { data: [], error: null };
    if (name === "registra_effetto") return { data: { id: "e1" }, error: null };
    return { data: null, error: null };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function apriAssegnoFuturo() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ExpensePaymentDialog costId="cost" onClose={vi.fn()} apriInRegistrazione /></QueryClientProvider>);
  await screen.findByLabelText("Importo");
  fireEvent.click(screen.getByRole("combobox", { name: "Metodo" }));
  fireEvent.click(await screen.findByRole("option", { name: "Assegno" }));
  fireEvent.change(screen.getByLabelText("Data dell'assegno"), { target: { value: "2099-01-10" } });
}

it("costo con rate: la rata è obbligatoria e arriva a registra_effetto", async () => {
  fake.rate = [{ id: "r1", numero: 1, importo: 400, scadenza: "2099-01-10", stato: "da_pagare" }, { id: "r2", numero: 2, importo: 600, scadenza: "2099-02-10", stato: "da_pagare" }];
  await apriAssegnoFuturo();
  await screen.findByLabelText("Rata");
  const bottone = screen.getByRole("button", { name: "Registra assegno" });
  expect(bottone).toBeDisabled();
  expect(screen.getByText("Scegli la rata che l'assegno copre")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("combobox", { name: "Rata" }));
  fireEvent.click(await screen.findByRole("option", { name: /Rata 2 di 2/ }));
  // L'importo proposto (1000) supera il libero della rata (600): il pulsante resta chiuso finché non si corregge.
  await waitFor(() => expect(screen.getByRole("button", { name: "Registra assegno" })).toBeDisabled());
  fireEvent.change(screen.getByLabelText("Importo"), { target: { value: "600" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Registra assegno" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Registra assegno" }));
  await waitFor(() => expect(fake.rpc).toHaveBeenCalledWith("registra_effetto", expect.objectContaining({ p_fonte_tipo: "costo", p_rata_fornitore_id: "r2" })));
});

it("costo senza rate: nessuna tendina «Rata»", async () => {
  fake.rate = [];
  await apriAssegnoFuturo();
  await waitFor(() => expect(screen.getByRole("button", { name: "Registra assegno" })).not.toBeDisabled());
  expect(screen.queryByLabelText("Rata")).toBeNull();
});
