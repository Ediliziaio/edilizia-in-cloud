import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaApprovareCantieri } from "@/components/campo/DaApprovareCantieri";

// La UI vera di approvazione (pesante) è mockata: qui verifichiamo che il
// pulsante apra il popup, non la logica di approvazione (ha i suoi test).
vi.mock("@/components/orders/OrdineRapportiniCampo", () => ({
  OrdineRapportiniCampo: ({ orderId }: { orderId: string }) => <div>Approvazione rapportini di {orderId}</div>,
}));
vi.mock("@/components/orders/DaApprovareCommessa", () => ({
  DaApprovareCommessa: ({ orderId }: { orderId: string }) => <div>Timbrature e bolle di {orderId}</div>,
}));

// In Attività le cose da approvare del cantiere le vede solo chi è autorizzato ad approvarle.
const state = vi.hoisted(() => ({
  role: "company_staff",
  permessi: { canViewOrders: true, canEditOrders: false, isLoading: false },
  dati: { rapportini: [] as unknown[], correzioni: [] as unknown[], bolle: [] as unknown[] },
  ordini: [] as Array<Record<string, unknown>>,
  rpc: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.role, effectiveCompany: { id: "company" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => state.permessi }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: async (fn: string) => { state.rpc(fn); return { data: state.dati, error: null as unknown }; },
  from: () => ({ select: () => ({ in: async () => ({ data: state.ordini, error: null as unknown }) }) }),
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
  state.ordini = [{ id: "o1", client_name: "Mario Rossi", description: "Ristrutturazione", order_code: "ORD-1", indirizzo_lavori: "Via Roma 1" }];
});
afterEach(cleanup);

describe("Attività: dal cantiere, da approvare", () => {
  it("chi non può modificare le commesse non lo vede e non lo chiede al database", async () => {
    const { container } = mostra();
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("raggruppa per commessa (niente doppioni) e apre il popup per approvare tutto", async () => {
    state.permessi = { canViewOrders: true, canEditOrders: true, isLoading: false };
    mostra();
    const apri = await screen.findByRole("button", { name: "Apri e approva" });
    expect(screen.getByText("Dal cantiere, da approvare")).toBeInTheDocument();
    // Una sola riga per la commessa o1 (1 rapportino + 1 bolla): nome cliente + indirizzo, codice come riferimento.
    await waitFor(() => expect(document.body.textContent).toMatch(/Mario Rossi · Via Roma 1 · 2 da approvare/));
    expect(document.body.textContent).toMatch(/1 rapportino · 1 bolla/);
    expect(document.body.textContent).toContain("ORD-1");
    // Niente righe doppie: un solo pulsante per la commessa.
    expect(screen.getAllByRole("button", { name: "Apri e approva" })).toHaveLength(1);
    // Il popup mostra tutto il da approvare della commessa.
    fireEvent.click(apri);
    expect(await screen.findByText("Approvazione rapportini di o1")).toBeInTheDocument();
    expect(screen.getByText("Timbrature e bolle di o1")).toBeInTheDocument();
  });

  it("una riga per commessa, le più vecchie in cima con «in ritardo»", async () => {
    state.permessi = { canViewOrders: true, canEditOrders: true, isLoading: false };
    state.dati = {
      rapportini: [
        { id: "rNew", order_id: "o2", codice: "ORD-2", giorno: "2026-10-20", autore: "Marco Verdi", collaudo: false, ore: 8 },
        { id: "rOld", order_id: "o1", codice: "ORD-1", giorno: "2026-04-11", autore: "Marco Ricci", collaudo: false, ore: 8 },
      ],
      correzioni: [], bolle: [],
    };
    state.ordini = [
      { id: "o1", client_name: "Cliente Vecchio", description: "", order_code: "ORD-1", indirizzo_lavori: "Via A" },
      { id: "o2", client_name: "Cliente Nuovo", description: "", order_code: "ORD-2", indirizzo_lavori: "Via B" },
    ];
    mostra();
    await screen.findAllByRole("button", { name: "Apri e approva" });
    await waitFor(() => expect(document.body.textContent).toContain("in ritardo"));
    // Due commesse distinte, la più vecchia in cima, un pulsante ciascuna.
    const testo = document.body.textContent ?? "";
    expect(testo.indexOf("Cliente Vecchio")).toBeLessThan(testo.indexOf("Cliente Nuovo"));
    expect(screen.getAllByRole("button", { name: "Apri e approva" })).toHaveLength(2);
  });

  it("niente in attesa: il riquadro non occupa posto", async () => {
    state.role = "company_admin";
    state.dati = { rapportini: [], correzioni: [], bolle: [] };
    const { container } = mostra();
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("ufficio_da_approvare"));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
