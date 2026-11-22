import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router-dom";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({filters:[] as any[],api:vi.fn()}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"company-a"}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({isAdmin:true,canViewMarketingContacts:true})}));
vi.mock("@/lib/fishAgentProxy",()=>({callFishAgent:(...args:any[])=>state.api(...args)}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{const q:any={select:()=>q,eq:(...v:any[])=>{state.filters.push(v);return q;},not:()=>q,order:()=>q,limit:async()=>({data:table==="tasks"?[{id:"callback-a",fish_call_id:"call-a",contact_id:"lead-a",title:"Richiamare Laura Bianchi",status:"da_fare"}]:[],error:null as Error | null}),maybeSingle:async()=>({data:{trascrizione_json:[{role:"agent",message:"Richiesta assistenza ricevuta"}]},error:null as Error | null})};return q;}}}));
vi.mock("@/hooks/useCentralinoCalls",()=>({useCentralinoCalls:()=>({isLoading:false,isError:false,data:[{id:"call-a",kind:"ai",agentId:"agent-a",provider:"fish_audio",direction:"inbound",number:"+39020000001",status:"completata",seconds:80,date:"2026-11-10T10:00:00Z",contactId:null as string | null,customerId:"customer-a",name:"Cliente Demo",who:"Agente AI",audio:null as string | null,summary:"Assistenza richiesta",transcript:[] as {role: string; message: string}[]}]})}));
import {SilvioFishCallbacks} from "@/components/silvio/SilvioFishCallbacks";
import {CentralinoCallHistory} from "@/components/telephony/CentralinoCallHistory";
beforeEach(()=>{state.filters=[];state.api.mockReset();state.api.mockResolvedValue({status:"complete",tracks:[{role:"agent",url:"https://audio.example.invalid/signed-recording"}]});});
afterEach(cleanup);
describe("Centralino call detail",()=>{
 it("loads the scoped transcript only when a call is opened, and requests audio on demand",async()=>{
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CentralinoCallHistory/></MemoryRouter></QueryClientProvider>);
  expect(state.filters).toEqual([]);
  fireEvent.click(screen.getByRole("button",{name:/Cliente Demo/}));
  await screen.findByText("Richiesta assistenza ricevuta");
  expect(state.filters).toContainEqual(["company_id","company-a"]);expect(state.filters).toContainEqual(["id","call-a"]);
  expect(screen.getByRole("link",{name:"Apri scheda cliente"})).toHaveAttribute("href","/azienda/clienti/customer-a");
  expect(await screen.findByRole("link",{name:"Apri richiamo in Silvio"})).toHaveAttribute("href","/azienda/silvio-ai/attivita?richiamo=callback-a");
  expect(state.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Verifica registrazione Fish"}));
  await waitFor(()=>expect(state.api).toHaveBeenCalledWith("company-a","agent-a","call_recording",{call_id:"call-a"}));
 });
 it("shows one linked callback in Silvio and reads the transcript from the same call",async()=>{
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><SilvioFishCallbacks callbackId="callback-a"/></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("heading",{name:"Richiamare Laura Bianchi"});
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(await screen.findByText("Richiesta assistenza ricevuta")).toBeVisible();
  expect(state.filters).toContainEqual(["id","callback-a"]);
  expect(state.filters).toContainEqual(["id","call-a"]);
  expect(screen.getByRole("link",{name:"Apri scheda CRM"})).toHaveAttribute("href","/azienda/marketing/contatti/lead-a?pannello=chiamate");
 });
});
