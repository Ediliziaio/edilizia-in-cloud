import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const memory=vi.hoisted(()=>({models:[] as any[],fields:[] as any[],invocations:[] as any[],calls:[] as any[]}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"default-company"}})}));
vi.mock("@/hooks/useModelliEmail",()=>({useModelliEmail:()=>({data:memory.models,isLoading:false,isError:false})}));
vi.mock("@/components/flow-builder/config-panels/EmailBodyEditor",()=>({EmailBodyEditor:({value,onChange}:any)=><textarea aria-label="Corpo email" value={value||""} onChange={e=>onChange(e.target.value)}/>}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{
  from(table:string){const q={table,steps:[] as any[]};memory.calls.push(q);const chain:any=new Proxy({},{get(_,method){if(method==="then")return (resolve:any)=>Promise.resolve({data:table==="marketing_custom_fields"?memory.fields:[],error:null as null}).then(resolve);if(!["select","eq","is","order"].includes(String(method)))throw new Error("WRITE FORBIDDEN");return(...args:any[])=>{q.steps.push([method,...args]);return chain;};}});return chain;},
  functions:{invoke:async(name:string,options:any)=>{memory.invocations.push({name,...options});return {data:{ok:true,html:"<p>Example</p>",subject:"Test",missingVariables:["unknown.key"]},error:null as null};}},
}}));
import { EmailConfigPanel } from "@/components/flow-builder/config-panels/EmailConfigPanel";
import { EmailPreviewActions } from "@/components/flow-builder/config-panels/EmailPreviewActions";
const wrap=(element:React.ReactNode)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{element}</QueryClientProvider>);
beforeEach(()=>{memory.models=[];memory.fields=[];memory.invocations=[];memory.calls=[];});
afterEach(cleanup);
describe("automation email creation UI",()=>{
  it("choosing the recipient replaces the previous address",()=>{
    const onChange=vi.fn();wrap(<EmailConfigPanel config={{destinatario:"previous@example.invalid",oggetto:"Test",corpo:"<p>Test</p>"}} onChange={onChange} companyId="company"/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Inserisci variabile"})[0]);
    fireEvent.click(screen.getByRole("button",{name:"Email contatto {{contatto.email}}"}));
    expect(onChange).toHaveBeenCalledWith("destinatario","{{contatto.email}}");
  });
  it("subject variable replaces the selected text at the cursor",()=>{
    const onChange=vi.fn();wrap(<EmailConfigPanel config={{oggetto:"Ciao NOME, benvenuto",corpo:"<p>Test</p>"}} onChange={onChange} companyId="company"/>);
    const input=screen.getByLabelText("Oggetto email") as HTMLInputElement;input.focus();input.setSelectionRange(5,9);
    fireEvent.click(screen.getAllByRole("button",{name:"Inserisci variabile"})[1]);
    fireEvent.click(screen.getByRole("button",{name:"Nome contatto {{contatto.first_name}}"}));
    expect(onChange).toHaveBeenCalledWith("oggetto","Ciao {{contatto.first_name}}, benvenuto");
  });
  it("loads old English configuration fields without presenting a blank editor",()=>{
    wrap(<EmailConfigPanel config={{email_subject:"Legacy subject",email_body:"<p>Legacy body</p>",email_to:"legacy@example.invalid"}} onChange={()=>{}} companyId="company"/>);
    expect(screen.getByLabelText("Oggetto email")).toHaveValue("Legacy subject");
    expect(screen.getByLabelText("Corpo email")).toHaveValue("<p>Legacy body</p>");
    expect(screen.getByLabelText("Destinatario email")).toHaveValue("legacy@example.invalid");
  });
  it("missing last template is visible and cannot produce a stale preview",async()=>{
    wrap(<EmailConfigPanel config={{modello_id:"deleted",oggetto:"Old",corpo:"<p>Old</p>"}} onChange={()=>{}} companyId="company"/>);
    expect(screen.getByText(/Il modello collegato non esiste più/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Anteprima"})).toBeDisabled();
  });
  it("detaching a template copies its current content, not the old node draft",()=>{
    memory.models=[{id:"model",name:"Current",subject:"Current subject",html_content:"<p>Current body</p>"}];const onPatch=vi.fn();
    wrap(<EmailConfigPanel config={{modello_id:"model",oggetto:"Stale",corpo:"<p>Stale</p>"}} onChange={()=>{}} onPatch={onPatch} companyId="company"/>);
    fireEvent.click(screen.getByRole("button",{name:"Scrivi il testo qui"}));
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({modello_id:"",oggetto:"Current subject",corpo:"<p>Current body</p>"}));
  });
  it("blank recipient clearly means the contact and is not shown as an error",()=>{
    wrap(<EmailConfigPanel config={{oggetto:"Test",corpo:"<p>Test</p>"}} onChange={()=>{}} companyId="company"/>);
    expect(screen.getByText(/Vuoto: invia al contatto del flusso/)).toBeInTheDocument();expect(screen.queryByText(/Campo obbligatorio/)).not.toBeInTheDocument();
  });
  it("recipient picker offers email fields only, scoped to the flow company",async()=>{
    memory.fields=[{id:"email-id",name:"Second email",field_type:"email"},{id:"note-id",name:"Private notes",field_type:"text"}];
    wrap(<EmailConfigPanel config={{oggetto:"Test",corpo:"<p>Test</p>"}} onChange={()=>{}} companyId="flow-company" triggerItemId="opportunita_creata"/>);
    fireEvent.click(screen.getAllByRole("button",{name:"Inserisci variabile"})[0]);
    expect(await screen.findByText("Second email")).toBeInTheDocument();expect(screen.queryByText("Private notes")).not.toBeInTheDocument();expect(screen.queryByText("Nome opportunità")).not.toBeInTheDocument();
    expect(memory.calls.find(q=>q.table==="marketing_custom_fields").steps).toContainEqual(["eq","company_id","flow-company"]);
  });
  it("preview sends explicit company and never invokes test mode automatically",async()=>{
    wrap(<EmailPreviewActions companyId="flow-company" oggetto="Test" corpo="<p>Test</p>"/>);
    fireEvent.click(screen.getByRole("button",{name:"Anteprima"}));
    await waitFor(()=>expect(memory.invocations).toHaveLength(1));
    expect(memory.invocations[0].body).toMatchObject({mode:"preview",company_id:"flow-company"});
    expect(await screen.findByText(/Variabili senza esempio: unknown.key/)).toBeInTheDocument();expect(screen.getByTitle("Anteprima email")).toHaveAttribute("sandbox","");
  });
  it("empty rich-text body never invokes preview or sending",()=>{
    wrap(<EmailPreviewActions oggetto="Test" corpo="<p><br></p>"/>);
    fireEvent.click(screen.getByRole("button",{name:"Anteprima"}));fireEvent.click(screen.getByRole("button",{name:"Invia prova a me"}));expect(memory.invocations).toHaveLength(0);
  });
});
