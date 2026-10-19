import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RigheDaAbbinareCard } from "@/components/warehouse/RigheDaAbbinareCard";

// Le righe di bolla che non sono entrate in giacenza restano visibili in Magazzino.
const state = vi.hoisted(() => ({
  permessi: { canViewWarehouse: true, canEditWarehouse: true },
  carichi: [] as unknown[],
  rpc: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permessi }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (fn: string, args?: unknown) => {
    state.rpc(fn, args);
    return { data: fn === "magazzino_righe_da_abbinare" ? state.carichi : null, error: null as unknown };
  },
} }));

const mostra = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RigheDaAbbinareCard /></QueryClientProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  state.permessi = { canViewWarehouse: true, canEditWarehouse: true };
  state.carichi = [{ id: "k1", ddt_numero: "B-12", ddt_data: "2026-10-18", confermato_il: null, ordine: "ODA-7",
    righe: [{ descrizione: "Cerniera", codice: "CR-1", quantita: 2, motivo: "oltre quanto resta da ricevere sull'ordine" }] }];
});
afterEach(cleanup);

describe("Magazzino: righe di bolla da sistemare", () => {
  it("mostra bolla, ordine e motivo; «Fatto» le chiude", async () => {
    mostra();
    expect(await screen.findByText(/Bolla B-12 del 18\/10\/2026 · ordine ODA-7/)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Cerniera \(cod\. CR-1\) · 2 · oltre quanto resta/);
    fireEvent.click(screen.getByRole("button", { name: /Fatto/ }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("magazzino_righe_abbinate", { p_carico: "k1" }));
  });

  it("niente da sistemare: nessun riquadro; senza permesso di modifica niente «Fatto»", async () => {
    state.carichi = [];
    const { container } = mostra();
    await waitFor(() => expect(state.rpc).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    cleanup();
    state.carichi = [{ id: "k2", ddt_numero: null, ddt_data: null, confermato_il: null, ordine: null, righe: [{ descrizione: null, codice: null, quantita: 1, motivo: "articolo non trovato in magazzino" }] }];
    state.permessi = { canViewWarehouse: true, canEditWarehouse: false };
    mostra();
    expect(await screen.findByText(/Bolla s\.n\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Fatto/ })).not.toBeInTheDocument();
  });
});
