import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import AdminTeamChat from "@/pages/admin/AdminTeamChat";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
const state = vi.hoisted(() => ({allowed:true, rpc:vi.fn(), invalidate:vi.fn()}));
vi.mock("@/integrations/supabase/client", () => ({supabase:{rpc:state.rpc}}));
vi.mock("@/contexts/AuthContext", () => ({useAuth: () => ({user:{id:"me"}})}));
vi.mock("@/hooks/useSuperAdminPermissions", () => ({useSuperAdminPermissions: () => ({permissions:{can_manage_companies:state.allowed}})}));
vi.mock("@tanstack/react-query", () => ({useQueryClient: () => client}));
const client = {invalidateQueries:state.invalidate};
vi.mock("@/components/admin/AccessDenied", () => ({AccessDenied: () => <p>Accesso negato</p>}));
vi.mock("@/pages/azienda/ChatHub", () => ({default: ({companyIdOverride}: {companyIdOverride:string}) => <p>Chat {companyIdOverride}</p>}));
afterEach(() => {cleanup();state.allowed=true;state.rpc.mockReset();state.invalidate.mockReset();});
describe("Avvio della Chat superadmin", () => {
  it("non prepara canali senza il permesso richiesto", () => {
    state.allowed=false;render(<AdminTeamChat />);
    expect(screen.getByText("Accesso negato")).toBeInTheDocument();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rilegge subito i canali quando la preparazione termina", async () => {
    state.rpc.mockResolvedValue({error:null as Error|null});render(<AdminTeamChat />);
    expect(await screen.findByText(`Chat ${PLATFORM_ADMIN_COMPANY_ID}`)).toBeInTheDocument();
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({queryKey:["internal-chat-my-memberships",PLATFORM_ADMIN_COMPANY_ID,"me"]}));
  });
  it("distingue l'errore dell'assistente dalla disponibilità della chat e permette di riprovare", async () => {
    state.rpc.mockResolvedValueOnce({error:new Error("offline")}).mockResolvedValue({error:null as Error|null});render(<AdminTeamChat />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Puoi continuare");
    fireEvent.click(screen.getByRole("button",{name:"Riprova"}));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
