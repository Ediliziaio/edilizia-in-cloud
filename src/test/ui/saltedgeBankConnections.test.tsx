import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BankConnectionsCard from "@/components/integrations/BankConnectionsCard";
import { useSaltEdgeReturn } from "@/hooks/useSaltEdgeReturn";
import { invokeSaltEdge } from "@/lib/banking/saltedge";

const state = vi.hoisted(() => ({
  company: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa" as string | null,
  canManage: true, ready: true,
  connections: [] as Record<string, unknown>[],
  invoke: vi.fn(), toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(() => "toast"), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => state.company }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewTesoreria: true, canEditSettingsIntegrations: state.canManage, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: state.toast }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: (...args: unknown[]) => state.invoke(...args) },
  from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, neq: () => q, in: () => q, order: () => q,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === "bank_connections" ? state.connections : [], error: null }).then(resolve) };
    return q;
  },
} }));
beforeEach(() => {
  cleanup(); vi.clearAllMocks(); state.company = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"; state.canManage = true; state.ready = true; state.connections = [{ id: "salt-storico", institution_name: "Banca storica", status: "expired", provider_slug: "saltedge", expires_at: null }];
  state.invoke.mockImplementation(async (_name, options) => ({ error: null, data: options.body.action === "status" ? { ready: state.ready, mode: "pending", error: state.ready ? null : "Beta non abilitata" } : { ok: true, imported: 3 } }));
});
function mount(element = <BankConnectionsCard />, route = "/azienda/impostazioni/integrazioni") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}>{element}</MemoryRouter></QueryClientProvider>);
}

describe("Ricollegamento Salt Edge storico nell'interfaccia reale", () => {
  it("mostra Pending come banche simulate e richiede conferma esplicita", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Ricollega" }));
    await screen.findByText(/Beta con banche simulate/);
    expect(screen.getByRole("button", { name: "Continua con Salt Edge" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Continua con Salt Edge" })).toBeEnabled();
    expect(state.invoke.mock.calls.every(([, o]) => o.body.company_id === state.company)).toBe(true);
  });
  it("se la beta non e' configurata offre Riprova e non avvia collegamenti", async () => {
    state.ready = false; mount(); fireEvent.click(await screen.findByRole("button", { name: "Ricollega" }));
    await screen.findByText("Beta non abilitata");
    expect(screen.getByRole("button", { name: "Continua con Salt Edge" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeEnabled();
    expect(state.invoke.mock.calls.every(([, o]) => o.body.action === "status")).toBe(true);
  });
  it("mostra un errore comprensibile se il backend beta non e' raggiungibile", async () => {
    state.invoke.mockResolvedValue({ error: new Error("Failed to send a request to the Edge Function"), data: null });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Ricollega" }));
    await screen.findByText(/Collegamento Salt Edge non disponibile/);
    expect(screen.getByRole("button", { name: "Continua con Salt Edge" })).toBeDisabled();
    expect(screen.queryByText(/Failed to send/)).not.toBeInTheDocument();
  });
  it("a tunnel chiuso non avvia nuovi consensi, senza invalidare i dati gia' importati", async () => {
    state.invoke.mockResolvedValue({ error: null, data: { ready: true, mode: "pending", connectReady: false, connectError: "Riattiva HTTPS beta" } });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Ricollega" }));
    await screen.findByText("Riattiva HTTPS beta");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Continua con Salt Edge" })).toBeDisabled();
    expect(state.invoke.mock.calls.every(([, options]) => options.body.action === "status")).toBe(true);
  });
  it("rifiuta link di ritorno esterni e mantiene il modulo utilizzabile", async () => {
    state.invoke.mockImplementation(async (_name, options) => ({ error: null, data: options.body.action === "status" ? { ready: true, mode: "pending" } : { url: "https://evil.invalid/" } }));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Ricollega" }));
    await screen.findByText(/Beta con banche simulate/); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continua con Salt Edge" }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith("Il servizio non ha restituito un indirizzo di collegamento valido."));
    expect(screen.getByRole("button", { name: "Continua con Salt Edge" })).toBeEnabled();
  });
  it("mantiene Tesoreria come destinazione quando il collegamento parte da quella pagina", async () => {
    state.invoke.mockImplementation(async (_name, options) => ({ error: null, data: options.body.action === "status" ? { ready: true, mode: "pending" } : { url: "https://invalid.test" } }));
    mount(<BankConnectionsCard redirectPath="/azienda/tesoreria" />);
    fireEvent.click(await screen.findByRole("button", { name: "Ricollega" }));
    await screen.findByText(/Beta con banche simulate/);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continua con Salt Edge" }));
    await waitFor(() => expect(state.invoke).toHaveBeenCalledWith("bank-saltedge", { body: expect.objectContaining({ action: "reconnect", connection_id: "salt-storico", redirect_path: "/azienda/tesoreria" }) }));
  });
  it("finalizza il ritorno anche senza montare la scheda Connessioni", async () => {
    function Root() { useSaltEdgeReturn(state.company); return <div>Panoramica</div>; }
    mount(<Root />, "/azienda/tesoreria?bank_provider=saltedge&se_state=nonce&connection_id=10");
    await waitFor(() => expect(state.toast.success).toHaveBeenCalled());
    expect(state.invoke).toHaveBeenCalledTimes(1);
    expect(state.invoke).toHaveBeenCalledWith("bank-saltedge", { body: { action: "finalize", provider_connection_id: "10", state: "nonce", company_id: state.company } });
    expect(state.toast.error).not.toHaveBeenCalled();
  });
  it("non dichiara successo quando la finalizzazione e' rifiutata", async () => {
    state.invoke.mockResolvedValue({ error: null, data: { error: "Sessione non valida" } });
    function Root(): null { useSaltEdgeReturn(state.company); return null; }
    mount(<Root />, "/azienda/tesoreria?bank_provider=saltedge&se_state=forged&connection_id=10");
    await waitFor(() => expect(state.toast.error).toHaveBeenCalled());
    expect(state.toast.success).not.toHaveBeenCalled();
  });
  it("un consenso annullato non chiama la finalizzazione", async () => {
    function Root(): null { useSaltEdgeReturn(state.company); return null; }
    mount(<Root />, "/azienda/tesoreria?bank_provider=saltedge&se_state=nonce&error_class=AccessDenied");
    await waitFor(() => expect(state.toast.error).toHaveBeenCalled()); expect(state.invoke).not.toHaveBeenCalled();
  });
  it("mostra le azioni del solo connettore Salt Edge senza messaggi di migrazione", async () => {
    state.connections = [{ id: "salt", institution_name: "Banca beta", status: "linked", provider_slug: "saltedge", accounts_count: 1, last_sync_at: null, expires_at: null }];
    mount(); await screen.findByText("Banca beta");
    expect(screen.queryByText(/storico conservato/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiorna banca" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Disconnetti conto" })).toBeEnabled();
  });
  it("chi ha sola lettura non puo' avviare nuovi consensi", async () => {
    state.canManage = false; mount();
    expect(screen.getByRole("button", { name: "Collega conto" })).toBeDisabled();
  });
  it("senza azienda non esegue alcuna richiesta", async () => {
    await expect(invokeSaltEdge(null, { action: "sync" })).rejects.toThrow("Seleziona un'azienda");
    expect(state.invoke).not.toHaveBeenCalled();
  });
});
