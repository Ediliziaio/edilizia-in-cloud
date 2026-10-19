import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaApprovareCantieri } from "@/components/campo/DaApprovareCantieri";

// In Attività le cose da approvare del cantiere le vede solo chi è autorizzato ad approvarle.
const state = vi.hoisted(() => ({
  role: "company_staff",
  permessi: { canViewOrders: true, canEditOrders: false, isLoading: false },
  dati: { rapportini: [] as unknown[], correzioni: [] as unknown[], bolle: [] as unknown[] },
  rpc: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role, effectiveCompany: { id: "company" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permessi }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (fn: string) => { state.rpc(fn); return { data: state.dati, error: null }; },
} }));

const mostra = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><DaApprovareCantieri /></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  state.role = "company_staff";
  state.permessi = { canViewOrders: true, canEditOrders: false, isLoading: false };
  state.dati = {
    rapportini: [{ id: "r1", order_id: "o1", codice: "ORD-1", giorno: "2026-10-18", autore: "Marco Verdi", collaudo: false, ore: 8 }],
    correzioni: [],
    bolle: [{ id: "b1", order_id: "o1", codice: "ORD-1", fornitore: "Edilmarket", numero: "12", persona: "Marco Verdi" }],
  };
});
afterEach(cleanup);

describe("Attività: dal cantiere, da approvare", () => {
  it("chi non può modificare le commesse non lo vede e non lo chiede al database", async () => {
    const { container } = mostra();
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("chi può approvare vede rapportini e bolle con il collegamento alla commessa", async () => {
    state.permessi = { canViewOrders: true, canEditOrders: true, isLoading: false };
    mostra();
    expect(await screen.findByRole("link", { name: "Apri e approva" })).toHaveAttribute("href", "/azienda/ordini/o1?tab=cantiere&vista_cantiere=diario#section-rapportini");
    expect(screen.getByText("Dal cantiere, da approvare")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/Rapportino · ORD-1 · 18 ott · Marco Verdi · 8 h/);
    expect(document.body.textContent).toMatch(/Bolla dal cantiere · Edilmarket n\. 12 · ORD-1/);
  });

  it("niente in attesa: il riquadro non occupa posto", async () => {
    state.role = "company_admin";
    state.dati = { rapportini: [], correzioni: [], bolle: [] };
    const { container } = mostra();
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("ufficio_da_approvare"));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
