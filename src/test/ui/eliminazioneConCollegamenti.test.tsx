/**
 * Eliminare un documento collegato con la conferma scritta (12/11/2026).
 *
 * Due ordini confermati e mai consegnati non si potevano eliminare: «usa l'annullamento». Ora si
 * eliminano: la finestra dice cosa si cancella con lui e cosa resta scollegato, e chiede CANCELLA.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const state = vi.hoisted(() => ({ collegato: true, rpc: vi.fn(), success: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: state.rpc } }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: vi.fn() } }));
vi.mock("@/lib/api/pipelineTransitions", () => ({ savePipelineTransition: vi.fn() }));
vi.mock("@/lib/csvExport", () => ({ exportToCSV: vi.fn(), exportToXLSX: vi.fn() }));

import { useOperationalDeletion } from "@/hooks/useOperationalDeletion";
import { descriviTabelle } from "@/lib/orders/eliminazioneCollegamenti";

function App() {
  const d = useOperationalDeletion("oda", [{ id: "a", label: "ODA-1" }], true);
  return <>{d.checkbox("a", "ODA-1")}{d.toolbar}{d.confirmation}</>;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.collegato = true;
  state.rpc.mockImplementation(async (_n: string, a: { p_preview: boolean; p_ids: string[] }) => ({
    data: {
      deleted: a.p_preview ? 0 : 1,
      documents: [state.collegato
        ? { id: "a", label: "ODA-1", allowed: true, reason: null, version: "v1", avviso: "Ordine già inviato o confermato al fornitore",
            cancella: { purchase_order_items: 2 }, scollega: { ddt_ricezione: 1, company_costs: 1 }, conferma_scritta: true }
        : { id: "a", label: "ODA-1", allowed: true, reason: null, version: "v1", cancella: { purchase_order_items: 1 }, scollega: {}, conferma_scritta: false }],
    },
    error: null,
  }));
});
afterEach(cleanup);

async function apri() {
  render(<QueryClientProvider client={new QueryClient()}><App /></QueryClientProvider>);
  fireEvent.click(screen.getByLabelText("Seleziona ODA-1"));
  fireEvent.click(screen.getByRole("button", { name: "Elimina selezionati" }));
  await screen.findByRole("dialog");
}

describe("Eliminare un documento collegato", () => {
  it("dice cosa si cancella e cosa resta, e senza CANCELLA non parte", async () => {
    await apri();
    expect(screen.getByText("Ordine già inviato o confermato al fornitore")).toBeVisible();
    expect(screen.getByText("Si cancellano con lui: 2 righe dell'ordine.")).toBeVisible();
    expect(screen.getByText("Restano, ma scollegati: 1 DDT, 1 costi.")).toBeVisible();
    const elimina = screen.getByRole("button", { name: "Elimina definitivamente 1 documento" });
    expect(elimina).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Per confermare scrivi/), { target: { value: "cancel" } });
    expect(elimina).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Per confermare scrivi/), { target: { value: "cancella" } });
    expect(elimina).toBeEnabled();
    fireEvent.click(elimina);
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.rpc.mock.calls[1][1]).toMatchObject({ p_preview: false, p_expected: { a: "v1" }, p_conferma: "CANCELLA" });
  });

  it("una bozza senza collegamenti si elimina come prima, senza parola", async () => {
    state.collegato = false;
    await apri();
    expect(screen.queryByLabelText(/Per confermare scrivi/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Elimina definitivamente 1 documento" }));
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.rpc.mock.calls[1][1]).not.toHaveProperty("p_conferma");
  });

  it("i nomi delle tabelle diventano parole", () => {
    expect(descriviTabelle({ ddt_righe: 3, ddt_consegne: 2, zero: 0 })).toBe("3 righe di DDT, 2 consegne della merce");
    expect(descriviTabelle({ tabella_nuova: 1 })).toBe("1 tabella nuova");
    expect(descriviTabelle(undefined)).toBe("");
  });
});
