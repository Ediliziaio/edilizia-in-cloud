import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), proxy: vi.fn(), capability: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn(),
  prepare: vi.fn(), removeChannel: vi.fn(), on: vi.fn(), subscribe: vi.fn(), channel: vi.fn() }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => "company" }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ solaLettura: false }) }));
vi.mock("@/hooks/useUnifiedAgents", () => ({ useUnifiedAgents: () => ({ data: [{ id: "agent", tipo: "vocale", nome: "Demo", elevenlabs_agent_id: "remote" }] }) }));
vi.mock("@/modules/ai-agents/hooks/useElevenLabsProxy", () => ({ callElevenLabsProxy: mocks.proxy, requireAgentProxyV2: mocks.capability }));
vi.mock("@/lib/campaignPreparation", async () => ({ ...await vi.importActual("@/lib/campaignPreparation"), campaignPreparationRequest: mocks.prepare }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, warning: mocks.warning, error: mocks.error } }));
vi.mock("@tanstack/react-query", async () => ({ ...await vi.importActual("@tanstack/react-query"), useQuery: (...args: unknown[]) => mocks.query(...args) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { channel: mocks.channel, removeChannel: mocks.removeChannel } }));
import { StatisticheTab } from "@/components/agenti/StatisticheTab";
import { TelephonyTab } from "@/components/agenti/TelephonyTab";
import { CampagneTab } from "@/components/agenti/CampagneTab";
import { CampaignRecipientsDialog } from "@/components/agenti/CampaignRecipientsDialog";
function mount(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(<MemoryRouter><QueryClientProvider client={client}>{children}</QueryClientProvider></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  const channel = { on: mocks.on, subscribe: mocks.subscribe };
  mocks.channel.mockReturnValue(channel); mocks.on.mockReturnValue(channel);
  mocks.capability.mockResolvedValue(undefined);
  mocks.query.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
});
describe("campaign recipient preparation", () => {
  const campaign = { id: "campaign", nome: "Richiamo", aggiornato_il: "2026-10-11T08:00:00+00:00" };
  const contact = { id: "contact", nome: "Mario Demo", telefono: "+39 3331234567", exclusion: null as string | null };
  const data = (contacts = [contact], more = false) => mocks.query.mockReturnValue({ data: { contacts, has_more: more }, isLoading: false, isError: false, refetch: vi.fn() });
  it("shows the reason why a CRM contact cannot be selected", () => {
    data([{ ...contact, exclusion: "Contatto escluso dalle chiamate" } as any]);
    mount(<CampaignRecipientsDialog companyId="company" campaign={campaign} onClose={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Seleziona Mario Demo" })).toBeDisabled();
    expect(screen.getByText("Contatto escluso dalle chiamate")).toBeInTheDocument();
  });
  it("passes CRM IDs and the draft version, not untrusted phone numbers", async () => {
    data(); const close = vi.fn();
    mocks.prepare.mockResolvedValue({ prepared: 1, excluded: [] });
    mount(<CampaignRecipientsDialog companyId="company" campaign={campaign} onClose={close} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleziona Mario Demo" }));
    fireEvent.click(screen.getByRole("button", { name: "Salva destinatari" }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(mocks.prepare).toHaveBeenCalledWith("company", "prepare_campaign", { campaign_id: "campaign", updated_at: campaign.aggiornato_il, contact_ids: ["contact"] });
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining("Nessuna chiamata avviata"));
  });
  it("a failed save stays open and gives a way to reload a conflicting draft", async () => {
    data(); const close = vi.fn();
    mocks.prepare.mockRejectedValue(new Error("La campagna è cambiata"));
    mount(<CampaignRecipientsDialog companyId="company" campaign={campaign} onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva destinatari" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("La campagna è cambiata"));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ricarica la bozza" }));
    expect(close).toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });
  it("does not present a query error as an empty CRM list", () => {
    mocks.query.mockReturnValue({ data: undefined, error: new Error("Server non aggiornato"), isError: true, isLoading: false, refetch: vi.fn() });
    mount(<CampaignRecipientsDialog companyId="company" campaign={campaign} onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Server non aggiornato");
    expect(screen.getByRole("button", { name: "Salva destinatari" })).toBeDisabled();
    expect(screen.queryByText(/Nessun contatto trovato/)).not.toBeInTheDocument();
  });
  it("keeps selections when moving to another CRM page", () => {
    data([contact], true);
    mount(<CampaignRecipientsDialog companyId="company" campaign={campaign} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    expect(screen.getByText("1 selezionati · massimo 500")).toBeInTheDocument();
    expect(mocks.query).toHaveBeenLastCalledWith(expect.objectContaining({ queryKey: ["ai-campaign-contacts", "company", "", 1] }));
  });
  it("reports excluded recipients instead of implying the entire list was saved", async () => {
    data(); mocks.prepare.mockResolvedValue({ prepared: 1, excluded: [{ reason: "Numero duplicato" }] });
    mount(<CampaignRecipientsDialog companyId="company" campaign={campaign} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salva destinatari" }));
    await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("Numero duplicato")));
  });
});
describe("AI agent UI: errors are not empty successful data", () => {
  it("shows retry instead of zero statistics when loading fails", () => {
    const refetch = vi.fn();
    mocks.query.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    mount(<StatisticheTab />);
    expect(screen.getByRole("alert")).toHaveTextContent("contatori non sono disponibili");
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(refetch).toHaveBeenCalled();
    expect(screen.queryByText("Nessun dato disponibile")).not.toBeInTheDocument();
  });
  it("watches v2 calls, chat sessions and credits in the selected company", () => {
    mocks.query.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
    const view = mount(<StatisticheTab />);
    expect(mocks.channel).toHaveBeenCalledWith("ai-stats-realtime:company");
    for (const table of ["ai_conversations_v2", "ai_chat_sessions", "ai_credit_transactions"]) {
      expect(mocks.on).toHaveBeenCalledWith("postgres_changes", expect.objectContaining({ table, filter: "company_id=eq.company" }), expect.any(Function));
    }
    view.unmount(); expect(mocks.removeChannel).toHaveBeenCalled();
  });
  it("does not claim full inbound service after a partial phone link", async () => {
    mocks.query.mockReturnValue({ data: [{ id: "number", numero: "+390000000000", agent_id: "agent", attivo: true, elevenlabs_phone_id: null }], isLoading: false });
    mocks.proxy.mockResolvedValue({ elevenlabs_phone_number_id: "phone", inbound_assigned: false });
    mount(<TelephonyTab />);
    fireEvent.click(screen.getByRole("button", { name: "Collega per chiamate" }));
    await waitFor(() => expect(mocks.warning).toHaveBeenCalledWith(expect.stringContaining("non assegnate")));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.proxy).toHaveBeenCalledWith(expect.objectContaining({ company_id: "company", agent_id: "remote" }));
  });
  it("keeps failed phone loading distinct from no configured numbers", () => {
    mocks.query.mockReturnValue({ data: [], isLoading: false, isError: true, refetch: vi.fn() });
    mount(<TelephonyTab />);
    expect(screen.getByRole("alert")).toHaveTextContent("Impossibile caricare");
    expect(screen.queryByText("Nessun numero configurato")).not.toBeInTheDocument();
  });
  it("a campaign cannot pretend to dispatch calls without a worker", () => {
    mocks.query.mockImplementation(({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "ai-campaigns-v2" ? [
      { id: "campaign", nome: "Demo", stato: "bozza", tipo: "chiamata", totale_contatti: 0, chiamate_effettuate: 0,
        chiamate_completate: 0, tasso_risposta: 0, creato_il: "2026-10-11" },
    ] : [], isLoading: false }));
    mount(<CampagneTab />);
    expect(screen.getByRole("button", { name: "Avvio massivo non disponibile" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("nessuna chiamata parte");
  });
  it("whitespace is not accepted as the name of a campaign", () => {
    mount(<CampagneTab />);
    fireEvent.click(screen.getByRole("button", { name: "Nuova Campagna" }));
    fireEvent.change(screen.getByPlaceholderText("Es. Richiamo lead freddi"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Avanti" })).toBeDisabled();
  });
});
