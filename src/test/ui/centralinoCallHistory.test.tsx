import {act,render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {MemoryRouter} from "react-router-dom";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({
 filters:[] as unknown[][], api:vi.fn(), startCall:vi.fn(), update:vi.fn(), matched:true,
 callback:{
  id:"60396be0-94db-4b51-9bab-8ca6e9ca030c", fish_call_id:"call-a", contact_id:"lead-a",
  title:"Richiamare Laura Bianchi", status:"da_fare", notes:"Motivo: assistenza\nNumero: +39 0200000001", updated_at:"2026-11-22T18:00:00Z",
 },
}));
vi.mock("@/components/telephony/SoftphoneProvider",()=>({useSoftphoneOptional:()=>({status:"idle",startCall:state.startCall})}));
vi.mock("@/hooks/useEffectiveCompanyId",()=>({useEffectiveCompanyId:()=>"company-a"}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({isAdmin:true,canViewMarketingContacts:true})}));
vi.mock("@/lib/fishAgentProxy",()=>({callFishAgent:(...args:any[])=>state.api(...args)}));
vi.mock("sonner",()=>({toast:{success:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:(table:string)=>{
 const q={
  select:()=>q,
  eq:(...values: unknown[])=>{state.filters.push(values);return q;},
  not:()=>q,
  order:()=>q,
  update:(changes:unknown)=>{state.update(changes);return q;},
  limit:async()=>({data:table==="tasks"?[state.callback]:[],error:null as null}),
  maybeSingle:async()=>({data:table==="tasks"
    ? (state.matched ? {id:state.callback.id} : null)
    : {trascrizione_json:[{role:"agent",message:"Richiesta assistenza ricevuta"}]},error:null as null}),
 };
 return q;
}}}));
vi.mock("@/hooks/useCentralinoCalls",()=>({useCentralinoCalls:()=>({isLoading:false,isError:false,data:[{id:"call-a",kind:"ai",agentId:"agent-a",provider:"fish_audio",direction:"inbound",number:"+39020000001",status:"completata",seconds:80,date:"2026-11-10T10:00:00Z",contactId:null as string | null,customerId:"customer-a",name:"Cliente Demo",who:"Agente AI",audio:null as string | null,summary:"Assistenza richiesta",transcript:[] as {role: string; message: string}[]}]})}));
import {RichiamiCentralino} from "@/components/telephony/RichiamiCentralino";
import {CentralinoCallHistory} from "@/components/telephony/CentralinoCallHistory";
beforeEach(()=>{state.filters=[];state.api.mockReset();state.startCall.mockClear();state.update.mockClear();state.matched=true;state.api.mockResolvedValue({status:"complete",tracks:[{role:"agent",url:"https://audio.example.invalid/signed-recording"}]});});
afterEach(cleanup);
describe("Centralino call detail",()=>{
 it("loads the scoped transcript only when a call is opened, and requests audio on demand",async()=>{
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CentralinoCallHistory/></MemoryRouter></QueryClientProvider>);
  expect(state.filters).toEqual([]);
  fireEvent.click(screen.getByRole("button",{name:/Cliente Demo/}));
  await screen.findByText("Richiesta assistenza ricevuta");
  expect(state.filters).toContainEqual(["company_id","company-a"]);expect(state.filters).toContainEqual(["id","call-a"]);
  expect(screen.getByRole("link",{name:"Apri scheda cliente"})).toHaveAttribute("href","/azienda/clienti/customer-a");
  expect(await screen.findByRole("link",{name:"Apri richiamo"})).toHaveAttribute("href","/azienda/centralino?tab=richiami&richiamo=60396be0-94db-4b51-9bab-8ca6e9ca030c");
  expect(state.api).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Verifica registrazione Fish"}));
  await waitFor(()=>expect(state.api).toHaveBeenCalledWith("company-a","agent-a","call_recording",{call_id:"call-a"}));
 });
 it("ignores a recording request after leaving its call detail",async()=>{
  let finishRecording = () => {};
  state.api.mockImplementationOnce(() => new Promise(resolve => {
   finishRecording = () => resolve({status:"complete",tracks:[{role:"agent",url:"https://audio.example.invalid/expired-dialog"}]});
  }));
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><CentralinoCallHistory/></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button",{name:/Cliente Demo/}));
  fireEvent.click(screen.getByRole("button",{name:"Verifica registrazione Fish"}));
  fireEvent.click(screen.getByRole("button",{name:"Chiudi"}));
  fireEvent.click(screen.getByRole("button",{name:/Cliente Demo/}));
  await act(async () => { finishRecording(); });
  expect(screen.getByRole("button",{name:"Verifica registrazione Fish"})).toBeEnabled();
  expect(screen.getByRole("dialog").querySelector("audio")).toBeNull();
 });
 it("opens one linked callback in Centralino and reads the transcript from the same call",async()=>{
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><RichiamiCentralino callbackId="60396be0-94db-4b51-9bab-8ca6e9ca030c"/></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("heading",{name:"Richiamare Laura Bianchi"});
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(await screen.findByText("Richiesta assistenza ricevuta")).toBeVisible();
  expect(state.filters).toContainEqual(["id","60396be0-94db-4b51-9bab-8ca6e9ca030c"]);
  expect(state.filters).toContainEqual(["id","call-a"]);
  expect(screen.getByRole("link",{name:"Apri scheda CRM"})).toHaveAttribute("href","/azienda/marketing/contatti/lead-a?pannello=chiamate");
 });
 it("calls the agreed number and keeps the callback open when nobody answers",async()=>{
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><RichiamiCentralino/></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button",{name:"Richiama"}));
  expect(state.startCall).toHaveBeenCalledOnce();
  expect(state.startCall).toHaveBeenCalledWith("+390200000001",{name:undefined,contactId:"lead-a"});
  fireEvent.change(screen.getByRole("combobox",{name:"Esito del richiamo"}),{target:{value:"Non risponde"}});
  fireEvent.change(screen.getByLabelText("Nota facoltativa"),{target:{value:"Riprovare domani mattina."}});
  fireEvent.click(screen.getByRole("button",{name:"Salva esito"}));
  await waitFor(()=>expect(state.update).toHaveBeenCalledOnce());
  expect(state.update).toHaveBeenCalledWith({notes:expect.stringMatching(/Numero: \+39 0200000001[\s\S]+Non risponde\nRiprovare domani mattina\./)});
  expect(state.filters).toContainEqual(["company_id","company-a"]);
  expect(state.filters).toContainEqual(["fish_call_id","call-a"]);
  expect(state.filters).toContainEqual(["updated_at",state.callback.updated_at]);
 });
 it("reports a concurrent update and keeps the outcome draft",async()=>{
  state.matched=false;
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><RichiamiCentralino/></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button",{name:"Segna esito"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Esito del richiamo"}),{target:{value:"Contattato"}});
  fireEvent.click(screen.getByRole("button",{name:"Salva esito"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Il richiamo è cambiato");
  expect(screen.getByRole("combobox",{name:"Esito del richiamo"})).toHaveValue("Contattato");
  expect(state.update).toHaveBeenCalledWith(expect.objectContaining({status:"completata",completed_at:expect.any(String)}));
 });
});
