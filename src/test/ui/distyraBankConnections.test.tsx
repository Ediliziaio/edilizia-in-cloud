import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BankConnectionsCard from "@/components/integrations/BankConnectionsCard";
const state=vi.hoisted(()=>({manage:true,rows:[] as Record<string,unknown>[],invoke:vi.fn(),eq:vi.fn(),toast:{error:vi.fn(),success:vi.fn(),loading:vi.fn(),info:vi.fn(),warning:vi.fn()}}));
vi.mock("sonner",()=>({toast:state.toast}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"azienda"}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canViewTesoreria:true,canViewBankBalances:true,canEditSettingsIntegrations:state.manage,isLoading:false})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:(...args:unknown[])=>state.invoke(...args)},from:(table:string)=>{
  const q:any={select:()=>q,eq:(...args:unknown[])=>{state.eq(...args);return q;},neq:()=>q,order:()=>q,
    then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:table==="bank_connections"?state.rows:[],error:null}).then(resolve)};return q;
}}}));
beforeEach(()=>{cleanup();vi.clearAllMocks();state.manage=true;state.rows=[];state.invoke.mockResolvedValue({error:null,data:{url:"https://invalid.test"}});});
function mount(): void {render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><MemoryRouter><BankConnectionsCard /></MemoryRouter></QueryClientProvider>);}
it("il caricamento non interroga nessun servizio bancario e seleziona solo Distyra",async()=>{
  mount();await screen.findByText(/Collega il conto corrente/);expect(state.eq).toHaveBeenCalledWith("provider_slug","distyra");expect(state.invoke).not.toHaveBeenCalled();
});
it("l'unico pulsante Collega conto avvia Distyra con l'azienda selezionata",async()=>{
  mount();fireEvent.click(screen.getByRole("button",{name:"Collega conto"}));
  await waitFor(()=>expect(state.toast.error).toHaveBeenCalledWith("Il servizio non ha restituito un indirizzo di collegamento valido."));
  expect(state.invoke).toHaveBeenCalledTimes(1);expect(state.invoke).toHaveBeenCalledWith("bank-distyra",{body:expect.objectContaining({action:"start-link",company_id:"azienda"})});
});
it("un errore di rete viene mostrato senza aprire un altro connettore",async()=>{
  state.invoke.mockResolvedValue({error:new Error("Failed to send a request"),data:null});mount();fireEvent.click(screen.getByRole("button",{name:"Collega conto"}));
  await waitFor(()=>expect(state.toast.error).toHaveBeenCalled());expect(state.invoke.mock.calls.every(([name])=>name==="bank-distyra")).toBe(true);
});
it("chi consulta non avvia nuovi consensi",()=>{state.manage=false;mount();expect(screen.getByRole("button",{name:"Collega conto"})).toBeDisabled();});
it("una vecchia connessione in cache non riattiva pulsanti o servizi dismessi",async()=>{
  state.rows=[{id:"old",provider_slug:"saltedge",institution_name:"Banca dismessa",status:"expired"}];mount();await screen.findByText(/Collega il conto corrente/);
  expect(screen.queryByText("Banca dismessa")).not.toBeInTheDocument();expect(state.invoke).not.toHaveBeenCalled();
});
