import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ superAdmin: true, key: true, binding: null as any, api: vi.fn() }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isAdmin: true }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ role: state.superAdmin ? "super_admin" : "company_admin", viewAsRole: null as string | null }) }));
vi.mock("@/lib/fishAgentProxy", () => ({ callFishAgent: (...args: any[]) => state.api(...args) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { const q: any = new Proxy({}, { get(_, k) { if (k === "then") return (ok: any) => Promise.resolve({ data: [], error: null }).then(ok); return () => q; } }); return q; } } }));
import { FishAgentPanel } from "@/components/agenti/FishAgentPanel";
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FishAgentPanel companyId="company-a" agentId="agent-a" /></QueryClientProvider>); }
beforeEach(() => { state.superAdmin = true; state.key = true; state.binding = null; state.api.mockReset(); state.api.mockImplementation(async (_company, _agent, action) => action === "status" ? { binding: state.binding, keyConfigured: state.key } : { success: true }); });
afterEach(cleanup);
describe("Fish configuration in the actual agent editor", () => {
  it("does not offer publication or activation before an agent is provisioned", async () => {
    mount(); await screen.findByLabelText("ID voce Fish");
    expect(screen.getByRole("button", { name: "2. Pubblica Fish" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3. Attiva Fish per l’agente" })).toBeDisabled();
    expect(state.api.mock.calls.every(call => call[2] === "status")).toBe(true);
  });
  it("does not ask for the API key in the browser and explains missing server configuration", async () => {
    state.key = false; mount(); await screen.findByText(/Chiave Fish assente nel backend/);
    fireEvent.change(screen.getByLabelText("ID voce Fish"), { target: { value: "voice-id" } });
    expect(screen.getByRole("button", { name: "1. Sincronizza bozza Fish" })).toBeDisabled();
    expect(screen.queryByLabelText(/API.?KEY/i)).not.toBeInTheDocument();
  });
  it("a company admin cannot change rates or manage platform phone inventory", async () => {
    state.superAdmin = false; mount(); await screen.findByLabelText("ID voce Fish");
    expect(screen.queryByLabelText(/Costo Fish/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Collega una linea aziendale alla piattaforma Fish/)).not.toBeInTheDocument();
  });
  it("sends explicit per-company settings and keeps the key server-side", async () => {
    mount(); fireEvent.change(await screen.findByLabelText("ID voce Fish"), { target: { value: "voice-it" } });
    fireEvent.change(screen.getByLabelText("Costo Fish, €/minuto"), { target: { value: "0,06" } });
    fireEvent.change(screen.getByLabelText("Prezzo azienda, €/minuto"), { target: { value: "0,12" } });
    fireEvent.click(screen.getByRole("button", { name: "1. Sincronizza bozza Fish" }));
    await waitFor(() => expect(state.api).toHaveBeenCalledWith("company-a", "agent-a", "configure", { voice_id: "voice-it", real_per_min_eur: 0.06, billed_per_min_eur: 0.12 }));
  });
  it("allows draft simulation setup without inventing a tariff for live calls", async () => {
    mount(); fireEvent.change(await screen.findByLabelText("ID voce Fish"), { target: { value: "voice-it" } });
    fireEvent.click(screen.getByRole("button", { name: "1. Sincronizza bozza Fish" }));
    await waitFor(() => expect(state.api).toHaveBeenCalledWith("company-a", "agent-a", "configure", { voice_id: "voice-it" }));
    expect(screen.getByRole("button", { name: "2. Pubblica Fish" })).toBeDisabled();
  });
});
