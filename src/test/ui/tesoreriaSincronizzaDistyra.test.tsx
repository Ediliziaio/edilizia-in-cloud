import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Tesoreria from "@/pages/azienda/Tesoreria";
const state=vi.hoisted(()=>({mobile:false,manage:true,sync:vi.fn(),toast:{error:vi.fn(),success:vi.fn(),warning:vi.fn(),info:vi.fn()}}));
vi.mock("sonner",()=>({toast:state.toast}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"azienda"}})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canViewTesoreria:true,canViewBankBalances:true,canEditSettingsIntegrations:state.manage})}));
vi.mock("@/hooks/use-mobile",()=>({useIsMobile:()=>state.mobile}));
vi.mock("@/hooks/useDistyraReturn",()=>({useDistyraReturn:()=>false}));
vi.mock("@/hooks/useManualTreasury",()=>({useManualTreasury:()=>({accounts:[],isLoading:false})}));
vi.mock("@/hooks/useSubscriptionLimits",()=>({useSubscriptionLimits:()=>({isScopriPlan:false})}));
vi.mock("@/lib/banking/sincronizzazione",()=>({sincronizzaBancheAzienda:(...args:unknown[])=>state.sync(...args)}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>{const q:any={select:()=>q,eq:()=>q,neq:()=>q,then:(f:(v:unknown)=>unknown)=>Promise.resolve({count:3,error:null}).then(f)};return q;}}}));
vi.mock("@/components/tesoreria/TreasuryOverview",()=>({default:({refreshKey}:{refreshKey:number})=><div>Panoramica aggiornata {refreshKey}</div>}));
vi.mock("@/components/tesoreria/BankAccountsList",()=>({default:()=> <div>Conti</div>}));
vi.mock("@/components/tesoreria/TransactionsFeed",()=>({default:()=> <div>Movimenti</div>}));
vi.mock("@/components/integrations/BankConnectionsCard",()=>({default:()=> <div>Gestione collegamenti Distyra</div>}));
vi.mock("@/components/tesoreria/BankReconciliation",()=>({default:():null=>null}));
vi.mock("@/pages/azienda/CashFlowForecast",()=>({default:():null=>null}));
vi.mock("@/components/tesoreria/BankAlertRules",()=>({default:():null=>null}));
vi.mock("@/components/tesoreria/CategorizationRules",()=>({default:():null=>null}));
vi.mock("@/components/tesoreria/ExpenseReports",()=>({default:():null=>null}));
vi.mock("@/components/tesoreria/ManualTreasuryPanel",()=>({ManualTreasuryPanel:():null=>null}));
beforeEach(()=>{cleanup();vi.clearAllMocks();state.mobile=false;state.manage=true;state.sync.mockResolvedValue({totale:3,aggiornate:3,movimenti:12,avvisi:[],errori:[]});});
function mount(route="/azienda/tesoreria"):void {
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><MemoryRouter initialEntries={[route]}><Tesoreria /></MemoryRouter></QueryClientProvider>);
}
it("Sincronizza usa il flusso aziendale Distyra e aggiorna i dati mostrati",async()=>{
 mount();fireEvent.click(await screen.findByRole("button",{name:"Sincronizza"}));
 await waitFor(()=>expect(state.sync).toHaveBeenCalledWith("azienda",true));
 await screen.findByText("Panoramica aggiornata 1");expect(state.toast.success).toHaveBeenCalledWith("Sincronizzati 12 movimenti da 3 collegamenti");
});
it("gli errori di una banca restano visibili senza nascondere le altre riuscite",async()=>{
 state.sync.mockResolvedValue({totale:3,aggiornate:2,movimenti:4,avvisi:[],errori:["BCC: consenso non pronto"]});mount();
 fireEvent.click(await screen.findByRole("button",{name:"Sincronizza"}));await waitFor(()=>expect(state.toast.warning).toHaveBeenCalledWith("Aggiornati 2 collegamenti su 3",{description:"BCC: consenso non pronto"}));
 expect(state.toast.success).not.toHaveBeenCalled();
});
it("movimenti rinviati non vengono dichiarati sincronizzati e aggiornano comunque i conti recuperati",async()=>{
 state.sync.mockResolvedValue({totale:1,aggiornate:0,movimenti:0,avvisi:["BCC: limite giornaliero"],errori:[]});mount();
 fireEvent.click(await screen.findByRole("button",{name:"Sincronizza"}));await screen.findByText("Panoramica aggiornata 1");
 expect(state.toast.info).toHaveBeenCalledWith("Collegamenti verificati; movimenti in attesa",{description:"BCC: limite giornaliero"});expect(state.toast.success).not.toHaveBeenCalled();
});
it("un utente senza gestione consensi aggiorna i conti senza finalizzarli",async()=>{
 state.manage=false;mount();fireEvent.click(await screen.findByRole("button",{name:"Sincronizza"}));await waitFor(()=>expect(state.sync).toHaveBeenCalledWith("azienda",false));
});
it("le connessioni restano accessibili anche aprendo il collegamento dal telefono",async()=>{
 state.mobile=true;mount("/azienda/tesoreria?tab=connessioni");await screen.findByText("Gestione collegamenti Distyra");
});
it("se i collegamenti sono stati rimossi indirizza alla gestione banche",async()=>{
 state.sync.mockResolvedValue({totale:0,aggiornate:0,movimenti:0,avvisi:[],errori:[]});mount();
 fireEvent.click(await screen.findByRole("button",{name:"Sincronizza"}));await screen.findByText("Gestione collegamenti Distyra");expect(state.toast.success).not.toHaveBeenCalled();
});
