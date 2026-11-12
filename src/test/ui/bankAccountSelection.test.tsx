import {beforeEach,expect,it,vi} from "vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import BankAccountSelection from "@/components/tesoreria/BankAccountSelection";
const state=vi.hoisted(()=>({admin:false,manage:true,rpc:vi.fn(),selected:[] as {account_id:string}[],limit:3}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({userRoles:state.admin?["super_admin"]:[]})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditSettingsIntegrations:state.manage,canViewBankBalances:true})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:(...a:unknown[])=>state.rpc(...a),from:(table:string)=>{
 const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,maybeSingle:()=>q,then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({error:null,data:table==="bank_sync_settings"?{account_limit:state.limit,automatic_sync:true}:table==="bank_account_choices"?state.selected:table==="bank_connections"?[{id:"bank",institution_name:"Banca"}]:table==="bank_accounts_operativi"?[1,2,3,4].map(n=>({id:`a${n}`,iban:`IT000${n}`,account_name:`Conto ${n}`,connection_id:"bank"})):[]}).then(resolve)};return q;
}}}));
beforeEach(()=>{cleanup();vi.clearAllMocks();state.admin=false;state.manage=true;state.selected=[];state.limit=3;state.rpc.mockResolvedValue({error:null});});
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><BankAccountSelection companyId="azienda"/></QueryClientProvider>);}
it("parte da 0/3, limita la scelta e conferma solo gli identificativi scelti",async()=>{
 mount();await screen.findByText("0/3");const boxes=screen.getAllByRole("checkbox");for(const b of boxes.slice(0,3))fireEvent.click(b);
 expect(boxes[3]).toBeDisabled();expect(screen.getByRole("button",{name:"Conferma 3/3 conti"})).toBeEnabled();
 fireEvent.click(screen.getByRole("button",{name:"Conferma 3/3 conti"}));await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith("bank_select_accounts",{p_company:"azienda",p_accounts:["a1","a2","a3"]}));
 expect(screen.queryByLabelText(/Limite conti/)).not.toBeInTheDocument();
});
it("superadmin può aumentare il limite e il contatore riflette il limite salvato",async()=>{
 state.admin=true;state.limit=5;state.selected=[{account_id:"a1"}];mount();await screen.findByText("1/5");fireEvent.change(screen.getByLabelText(/Limite conti/),{target:{value:"6"}});fireEvent.click(screen.getByRole("button",{name:"Aggiorna limite"}));
 await waitFor(()=>expect(state.rpc).toHaveBeenCalledWith("bank_set_account_limit",{p_company:"azienda",p_limit:6}));
});
it("chi consulta vede il conteggio e gli orari ma non cambia la selezione",async()=>{
 state.manage=false;mount();await screen.findByText("0/3");for(const b of screen.getAllByRole("checkbox"))expect(b).toBeDisabled();expect(screen.queryByRole("button",{name:/Conferma/})).not.toBeInTheDocument();expect(screen.getByText(/7:00 e alle 18:00/)).toBeInTheDocument();expect(state.rpc).not.toHaveBeenCalled();
});
