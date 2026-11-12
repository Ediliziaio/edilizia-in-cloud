import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useDistyraReturn } from "@/hooks/useDistyraReturn";
import { invokeDistyra } from "@/lib/banking/distyra";
import BankConnectionsCard from "@/components/integrations/BankConnectionsCard";

const state = vi.hoisted(() => ({ company: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", canManage:true, count:0, invoke: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), loading: vi.fn(() => "toast") } }));
vi.mock("sonner", () => ({ toast: state.toast }));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({ useEffectiveCompanyId: () => state.company }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canViewTesoreria: true, canViewBankBalances: true, canEditSettingsIntegrations: state.canManage, isLoading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: (...args: unknown[]) => state.invoke(...args) },
  from: (table: string) => {
    const q: any = { select: () => q, eq: () => q, neq: () => q, in: () => q, order: () => q,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null, data: table === "bank_connections" ? [{id:"conn",provider_slug:"distyra",status:"error",institution_name:"Banca esempio",accounts_count:state.count}] : [] }).then(resolve) };
    return q;
  },
} }));
beforeEach(() => { cleanup(); vi.clearAllMocks(); state.canManage=true; state.count=0; vi.spyOn(document,"visibilityState","get").mockReturnValue("visible"); });
function Root(): null { useDistyraReturn(state.company); return null; }
function mount(element = <Root />) {
  const client = new QueryClient({ defaultOptions: {queries:{retry:false,gcTime:0}} });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/azienda/tesoreria?bank_provider=distyra&dy=rif"]}>{element}</MemoryRouter></QueryClientProvider>);
}
function results(accounts: number, failSync = false) {
  state.invoke.mockImplementation(async (_name, {body}) => ({error:null,data:body.action==="finalize" ? {conti:accounts,connection_id:"conn"} : failSync ? {error:"Limite giornaliero. Non serve ricollegare."} : {movimenti:9}}));
}
describe("Distyra: ritorno dalla banca e recupero manuale", () => {
  it("conferma tre conti soltanto dopo la registrazione e usa il contesto visibile per i movimenti", async () => {
    results(3); mount(); await waitFor(()=>expect(state.toast.success).toHaveBeenCalledWith("Conto collegato: 3 conti, 9 movimenti",{id:"toast"}));
    expect(state.invoke).toHaveBeenCalledWith("bank-distyra",{body:expect.objectContaining({action:"sync",company_id:state.company,on_screen:true})});
  });
  it("zero conti non significa successo e non avvia letture inutili", async () => {
    results(0); mount(); await waitFor(()=>expect(state.toast.error).toHaveBeenCalled());
    expect(state.invoke).toHaveBeenCalledTimes(1); expect(state.toast.success).not.toHaveBeenCalled();
  });
  it("un limite sui movimenti conserva il successo del collegamento senza inventare zero movimenti", async () => {
    results(3,true); mount(); await waitFor(()=>expect(state.toast.info).toHaveBeenCalledWith(expect.stringContaining("Conto collegato (3). Limite giornaliero"),{id:"toast"}));
    expect(state.toast.success).not.toHaveBeenCalled(); expect(state.toast.error).not.toHaveBeenCalled();
  });
  it("la ripresa manuale aggiorna i conti anche se i movimenti devono attendere", async () => {
    results(3,true); mount(<BankConnectionsCard />);
    fireEvent.click(await screen.findByRole("button",{name:"Aggiorna movimenti"}));
    await waitFor(()=>expect(state.toast.info).toHaveBeenCalledWith(expect.stringContaining("Conti collegati (3). Limite giornaliero"),{id:"toast"}));
    expect(state.toast.success).not.toHaveBeenCalled();
  });
  it("una scheda nascosta non dichiara un utente in attesa alla banca", async () => {
    vi.spyOn(document,"visibilityState","get").mockReturnValue("hidden"); results(3);
    await invokeDistyra(state.company,{action:"sync",on_screen:true},{onScreen:true});
    expect(state.invoke).toHaveBeenCalledWith("bank-distyra",{body:expect.objectContaining({on_screen:false})});
  });
  it("chi può leggere Tesoreria aggiorna i conti esistenti senza modificare i consensi", async () => {
    state.canManage=false; state.count=3; results(3); mount(<BankConnectionsCard />);
    fireEvent.click(await screen.findByRole("button",{name:"Aggiorna movimenti"}));
    await waitFor(()=>expect(state.toast.success).toHaveBeenCalledWith("Sincronizzati 9 movimenti",{id:"toast"}));
    expect(state.invoke.mock.calls.some(([,o])=>o.body.action==="finalize")).toBe(false);
  });
});
