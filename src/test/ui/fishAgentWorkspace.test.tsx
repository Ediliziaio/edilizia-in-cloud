import { render,screen,fireEvent,waitFor,cleanup } from "@testing-library/react";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { beforeEach,afterEach,describe,it,expect,vi } from "vitest";
const state=vi.hoisted(()=>({events:[] as string[],updates:[] as any[],filters:[] as any[],api:vi.fn()}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({role:"company_admin",viewAsRole:null})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({isAdmin:true})}));
vi.mock("@/lib/fishAgentProxy",()=>({callFishAgent:(...args:any[])=>state.api(...args)}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>{const q:any={update:(value:any)=>{state.events.push("save");state.updates.push(value);return q;},eq:(...args:any[])=>{state.filters.push(args);return q;},select:()=>q,order:async()=>({data:[],error:null}),single:async()=>({data:{id:"a"},error:null})};return q;}}}));
vi.mock("@/components/agenti/FishAgentPanel",()=>({FishAgentPanel:()=>null}));
vi.mock("@/components/agenti/FishSimulationPanel",()=>({FishSimulationPanel:()=>null}));
vi.mock("@/components/agenti/FishVoicePreview",()=>({FishVoicePreview:()=>null}));
vi.mock("@/components/agenti/ConversazioniTab",()=>({ConversazioniTab:()=>null}));
import { FishAgentWorkspace } from "@/components/agenti/FishAgentWorkspace";
import { toast } from "sonner";
const agent={id:"a",nome:"Centralino prova",company_id:"company-a",system_prompt:"Rispondi ai clienti e verifica sempre gli strumenti.",primo_messaggio:"Buongiorno",lingua:"it",llm_model:"gemini-2.5-flash",durata_max_secondi:300,registra_chiamate:false,trascrivi_chiamate:true,tools_config:{voice_provider:"fish_audio",custom_branch:{keep:true},edilizia_tools:{get_availability:{enabled:true,webhook_url:"keep"}}}};
function mount(value=agent){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><FishAgentWorkspace agent={value} companyId="company-a" onBack={()=>{}} /></QueryClientProvider>);}
beforeEach(()=>{window.history.replaceState({},"","/");vi.clearAllMocks();state.events=[];state.updates=[];state.filters=[];state.api.mockReset();state.api.mockImplementation(async(_company,_id,action)=>{
 if(action==="status")return {keyConfigured:true,binding:{voice_id:"0e36e185d0654d5bac3d24331562a0cc",fish_agent_id:"fish-a",published:false,enabled:false}};
 if(action==="available_voices")return {voices:[]};state.events.push(action);return {success:true};
});});
afterEach(cleanup);
describe("Fish editor saves real settings before synchronizing",()=>{
 it("opens the voice deep link without starting a microphone or a paid session",async()=>{
  window.history.replaceState({},"","/?prova=voce");mount();await screen.findByRole("dialog",{name:"Parla con il tuo agente"});
  await waitFor(()=>expect(screen.getByRole("button",{name:"Avvia con microfono"})).not.toBeDisabled());
  expect(state.api.mock.calls.every(call=>["status","available_voices"].includes(call[2]))).toBe(true);
 });
 it("pauses, saves scoped settings while preserving configuration branches, then synchronizes",async()=>{
  mount();await screen.findByText("Bozza sincronizzata");
  fireEvent.change(screen.getByLabelText("Prompt di sistema"),{target:{value:"Nuove istruzioni per il centralino: conferma il recapito prima di salvare."}});
  fireEvent.change(screen.getByLabelText("Durata massima"),{target:{value:"6"}});
  fireEvent.click(screen.getByLabelText("Registra audio"));
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.events).toEqual(["pause","save","configure"]));
  expect(state.updates[0]).toMatchObject({durata_max_secondi:360,registra_chiamate:true,tools_config:{voice_provider:"fish_audio",custom_branch:{keep:true},fish:{voice:{tts_model:"drama-3"}},edilizia_tools:{get_availability:{webhook_url:"keep",enabled:true}}}});
  expect(state.filters).toContainEqual(["company_id","company-a"]);
  expect(state.filters).toContainEqual(["id","a"]);
  expect(state.api).toHaveBeenCalledWith("company-a","a","configure",{voice_id:"0e36e185d0654d5bac3d24331562a0cc"});
 });
 it("rejects an incomplete transfer before changing the running configuration",async()=>{
  mount({...agent,tools_config:{...agent.tools_config,system_tools:{transfer_number:true},trasferimento:{numero:""}}} as any);
  await screen.findByText("Bozza sincronizzata");
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Salva bozza"})).not.toBeDisabled());
  expect(state.events).toEqual([]);expect(state.updates).toEqual([]);
 });
 it("does not save if pausing the old configuration fails",async()=>{
  const original=state.api.getMockImplementation()!;
  state.api.mockImplementation(async(...args:any[])=>{if(args[2]==="pause")throw new Error("Pausa non riuscita");return original(...args);});
  mount();await screen.findByText("Bozza sincronizzata");
  fireEvent.change(screen.getByLabelText("Prompt di sistema"),{target:{value:"Istruzioni nuove che non devono essere salvate se Fish resta attivo."}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(toast.error).toHaveBeenCalledWith("Pausa non riuscita"));
  expect(state.updates).toEqual([]);
  expect(state.api.mock.calls.some(call=>call[2]==="configure")).toBe(false);
 });
 it("keeps edits made during a save marked as unsaved",async()=>{
  let release!:()=>void;
  const configure=new Promise<void>(resolve=>{release=resolve;});
  const original=state.api.getMockImplementation()!;
  state.api.mockImplementation(async(...args:any[])=>{if(args[2]==="configure")await configure;return original(...args);});
  mount();await screen.findByText("Bozza sincronizzata");
  fireEvent.change(screen.getByLabelText("Prompt di sistema"),{target:{value:"Prima versione del prompt da salvare e sincronizzare."}});
  fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
  await waitFor(()=>expect(state.updates).toHaveLength(1));
  fireEvent.change(screen.getByLabelText("Prompt di sistema"),{target:{value:"Seconda versione ancora in modifica durante il salvataggio."}});
  release();
  await screen.findByText("Modifiche da salvare");
  expect(state.updates[0].system_prompt).toBe("Prima versione del prompt da salvare e sincronizzare.");
 });
});
