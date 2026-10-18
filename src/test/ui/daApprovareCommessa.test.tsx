import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DaApprovareAvviso, DaApprovareCommessa } from "@/components/orders/DaApprovareCommessa";
import { istanteDaGiornoEOra } from "@/components/campo/CorrezioneTimbratura";

const state = vi.hoisted(() => ({
  correzioni: [] as Record<string, unknown>[],
  rapportiniInviati: 0,
  acquistiDaVerificare: 0,
  rpc: vi.fn(), rpcError: null as unknown, success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: "company_admin", effectiveCompany: { id: "company" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canEditOrders: true, isLoading: false }) }));
vi.mock("@/components/warehouse/AcquistiCampoCard", () => ({ AcquistiCampoCard: (): null => null }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    let head = false;
    const q: Record<string, unknown> = {};
    q.select = (_c: string, opt?: { head?: boolean }) => { head = !!opt?.head; return q; };
    for (const m of ["eq", "in", "gte", "order", "limit", "or"]) q[m] = () => q;
    q.then = (yes: (r: unknown) => unknown, no: (e: unknown) => unknown) => {
      const r = table === "campo_rapportini" ? { count: state.rapportiniInviati, error: null as unknown }
        : table === "campo_acquisti" ? { count: state.acquistiDaVerificare, error: null as unknown }
        : table === "profiles" ? { data: [{ id: "u1", first_name: "Marco", last_name: "Verdi" }], error: null as unknown }
        : head ? { count: state.correzioni.length, error: null as unknown } : { data: state.correzioni, error: null as unknown };
      return Promise.resolve(r).then(yes, no);
    };
    return q;
  },
  rpc: async (fn: string, args: unknown): Promise<{ data: unknown; error: unknown }> => { state.rpc(fn, args); return { data: { stato: "approvata" }, error: state.rpcError }; },
} }));

const correzione = { id: "c1", user_id: "u1", tipo: "uscita", ora_richiesta: "2026-10-17T15:30:00Z", motivo: "Telefono scarico", created_at: "2026-10-18T07:00:00Z" };
const mostra = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => { vi.clearAllMocks(); state.correzioni = [correzione]; state.rapportiniInviati = 2; state.acquistiDaVerificare = 1; state.rpcError = null; });
afterEach(cleanup);

describe("Da approvare dal cantiere (commessa, ufficio)", () => {
  it("mostra chi chiede quale timbratura e perché", async () => {
    mostra(<DaApprovareCommessa orderId="o1" />);
    expect(await screen.findByText(/Marco Verdi · uscita del/)).toBeInTheDocument();
    expect(screen.getByText("«Telefono scarico»")).toBeInTheDocument();
    expect(screen.getByText("2 rapportini aspettano l’approvazione")).toBeInTheDocument();
  });

  it("approva: la timbratura entra nel registro", async () => {
    mostra(<DaApprovareCommessa orderId="o1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Approva" }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_timbratura_correzione_decidi", { p_id: "c1", p_approva: true, p_risposta: null }));
    await waitFor(() => expect(state.success).toHaveBeenCalledWith("Approvata: la timbratura è nel registro"));
  });

  it("respinge solo con un motivo, che legge l'operaio", async () => {
    mostra(<DaApprovareCommessa orderId="o1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Respingi" }));
    const invia = screen.getAllByRole("button", { name: "Respingi" }).at(-1)!;
    expect(invia).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo del rifiuto"), { target: { value: "Eri in ferie" } });
    fireEvent.click(invia);
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith("campo_timbratura_correzione_decidi", { p_id: "c1", p_approva: false, p_risposta: "Eri in ferie" }));
  });

  it("l'avviso in panoramica riassume cosa aspetta e sparisce quando non c'è niente", async () => {
    const apri = vi.fn();
    mostra(<DaApprovareAvviso orderId="o1" onOpen={apri} />);
    expect(await screen.findByText("2 rapportini · 1 bolla · 1 timbratura dimenticata")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approva" }));
    expect(apri).toHaveBeenCalled();
    cleanup();
    state.correzioni = []; state.rapportiniInviati = 0; state.acquistiDaVerificare = 0;
    const { container } = mostra(<DaApprovareAvviso orderId="o2" onOpen={apri} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe("ora della correzione", () => {
  it("giorno e ora sono in ora italiana", () => {
    expect(istanteDaGiornoEOra("2026-10-17", "17:30")?.toISOString()).toBe("2026-10-17T15:30:00.000Z");
    expect(istanteDaGiornoEOra("2026-01-15", "08:00")?.toISOString()).toBe("2026-01-15T07:00:00.000Z");
    // Giorni del cambio d'ora: dopo il passaggio vale la nuova ora (25/10 ora solare, 29/03 ora legale).
    expect(istanteDaGiornoEOra("2026-10-25", "17:30")?.toISOString()).toBe("2026-10-25T16:30:00.000Z");
    expect(istanteDaGiornoEOra("2026-03-29", "17:30")?.toISOString()).toBe("2026-03-29T15:30:00.000Z");
    expect(istanteDaGiornoEOra("2026-10-17", "25:00")).toBeNull();
    expect(istanteDaGiornoEOra("2026-10-17", "")).toBeNull();
  });
});
