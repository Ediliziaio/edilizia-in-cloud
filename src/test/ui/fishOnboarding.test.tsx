import { render,screen,fireEvent,waitFor,cleanup } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const state=vi.hoisted(()=>({create:vi.fn(),api:vi.fn(),ready:true,request:null as any}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({role:"company_admin",viewAsRole: null as string | null,effectiveCompany:{id:"company-a",name:"Azienda Demo"}})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({isAdmin:true})}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"company-a"}));
vi.mock("@/hooks/useUnifiedAgents",()=>({useCreateUnifiedAgent:()=>({mutateAsync:state.create,isPending:false})}));
vi.mock("@/lib/fishAgentProxy",()=>({callFishAgent:(...args:any[])=>state.api(...args)}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>{const q:any={select:()=>q,eq:()=>q,order:async()=>({data:[{id:"calendar-a",name:"Agenda sopralluoghi",duration_minutes:60}],error:null as Error | null})};return q;}}}));
vi.mock("@/components/agenti/FishLiveVoice",()=>({FishLiveVoice:({initialScenario,onConnected}:any)=><div><p>Scenario {initialScenario}</p><button onClick={onConnected}>Verifica collegamento vocale</button></div>}));
vi.mock("@/components/ui/select",async()=>{const {Children,isValidElement}=await import("react");return {Select:({value,onValueChange,children}:any)=>{const trigger=Children.toArray(children).find((child:any)=>isValidElement<Record<string, unknown>>(child) && child.props["aria-label"]);return <select aria-label={(trigger as any)?.props["aria-label"] || "Selezione"} value={value} onChange={event=>onValueChange(event.target.value)}>{children}</select>;},SelectTrigger:(): null=>null,SelectValue:(): null=>null,SelectContent:({children}:any)=><>{children}</>,SelectItem:({value,children}:any)=><option value={value}>{children}</option>};});
import { FishOnboardingWizard } from "@/components/agenti/FishOnboardingWizard";
function mount(existingAgent?:any){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><FishOnboardingWizard open existingAgent={existingAgent} onClose={()=>{}} onSuccess={()=>{}}/></QueryClientProvider>);}
beforeEach(()=>{state.ready=true;state.request=null;state.create.mockReset();state.api.mockReset();state.create.mockResolvedValue({id:"agent-a"});state.api.mockImplementation(async(company,id,action,input)=>{
 if(action==="status")return {keyConfigured:true,synchronized:state.ready,binding:state.ready?{fish_agent_id:"fish-a"}:null};
 if(action==="configure"){state.ready=true;return {success:true};}
 if(action==="number_connection_status")return {request:state.request,active:false};
 if(action==="request_number_connection"){state.request={id:"request-a",number_mode:input.number_mode,existing_number:input.existing_number,status:"requested",created_at:"2026-11-10T15:00:00Z"};return {request:state.request};}
 return {};
});});
afterEach(cleanup);
async function createFlow(){
 fireEvent.change(screen.getByLabelText("Nome dell’assistente"),{target:{value:"Accoglienza Demo"}});
 fireEvent.click(screen.getByRole("radio",{name:/Sopralluoghi e appuntamenti/}));
 fireEvent.click(screen.getByRole("button",{name:"Continua"}));
 await screen.findByRole("option",{name:/Agenda sopralluoghi/});
 fireEvent.change(screen.getByRole("combobox",{name:"Calendario dell’assistente"}),{target:{value:"calendar-a"}});
 fireEvent.click(screen.getByRole("button",{name:"Continua"}));
 fireEvent.click(screen.getByRole("button",{name:"Crea e prova"}));
 await screen.findByRole("heading",{name:"Prova il tuo assistente"});
}
describe("Company guided Fish onboarding",()=>{
 it("creates directly with the selected flow/calendar, offers voice testing, then saves a number request",async()=>{
  mount();await createFlow();
  expect(state.create).toHaveBeenCalledOnce();expect(state.create.mock.calls[0][0]).toMatchObject({nome:"Accoglienza Demo",tipo:"vocale",registra_chiamate:false,tools_config:{voice_provider:"fish_audio",fish:{calendar_id:"calendar-a",flow_id:"appointment"}}});
  expect(state.create.mock.calls[0][0].client_id).toMatch(/^[0-9a-f-]{36}$/);
  fireEvent.click(await screen.findByRole("button",{name:"Verifica collegamento vocale"}));await screen.findByText("Collegamento vocale verificato.");
  fireEvent.click(screen.getByRole("button",{name:"Collega il numero"}));
  fireEvent.change(await screen.findByLabelText("Numero aziendale"),{target:{value:"+39 (02) 123-4567"}});
  fireEvent.click(screen.getByRole("button",{name:"Richiedi il collegamento"}));
  await screen.findByText("Richiesta inviata");
  expect(state.api).toHaveBeenCalledWith("company-a","agent-a","request_number_connection",expect.objectContaining({number_mode:"existing",sip_available:"unknown"}));
  cleanup();mount({id:"agent-a",nome:"Accoglienza Demo",tools_config:{fish:{flow_id:"appointment"}}});
  await screen.findByRole("heading",{name:"Prova il tuo assistente"});fireEvent.click(screen.getByRole("button",{name:"Collega il numero"}));await screen.findByText("Richiesta inviata");expect(state.create).toHaveBeenCalledOnce();
 });
 it("retries only preparation when the draft exists but voice provisioning is incomplete",async()=>{
  state.ready=false;mount();await createFlow();
  fireEvent.click(await screen.findByRole("button",{name:"Prepara la prova"}));
  await screen.findByRole("button",{name:"Verifica collegamento vocale"});
  expect(state.create).toHaveBeenCalledOnce();expect(state.api.mock.calls.filter(call=>call[2]==="configure")).toHaveLength(1);
 });
 it("keeps an invalid operator number on the form without creating a draft",()=>{
  mount();fireEvent.click(screen.getByRole("button",{name:"Continua"}));fireEvent.change(screen.getByLabelText("Numero dell’operatore, facoltativo"),{target:{value:"021234567"}});fireEvent.click(screen.getByRole("button",{name:"Continua"}));
  expect(screen.getByRole("alert")).toHaveTextContent("prefisso internazionale");expect(state.create).not.toHaveBeenCalled();
 });
});
