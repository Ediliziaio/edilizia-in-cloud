import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ContractOfficeAssignments} from "@/components/orders/ContractOfficeAssignments";
import {ContractOfficeTasks} from "@/components/orders/ContractOfficeTasks";
const m=vi.hoisted(()=>({tasks:[] as Array<Record<string,unknown>>,insert:vi.fn(),editable:true}));
vi.mock("@/hooks/useOfficePeople",()=>({useOfficePeople:()=>({people:[{id:"office-a",label:"Persona ufficio · Personale collegato"}],unlinked:[{id:"unlinked",first_name:"Da",last_name:"Collegare"}],isError:false,isLoading:false})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditOrders:m.editable,canEditSettingsOrders:false})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"company-a"},user:{id:"author"}})}));
vi.mock("@/components/orders/PlaybookEditorDialog",()=>({PlaybookEditorDialog:():null=>null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{from:()=>({insert:m.insert})}}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>({data:m.tasks,isLoading:false,isError:false}),useQueryClient:()=>({invalidateQueries:vi.fn()}),useMutation:(c:any)=>({isPending:false,mutate:async(v:unknown)=>{try{await c.mutationFn(v);c.onSuccess?.();}catch(e){c.onError?.(e);}}})}));
beforeEach(()=>{m.tasks=[];m.editable=true;m.insert.mockReset();m.insert.mockReturnValue({select:()=>({single:async()=>({data:{id:"task"},error:null as null})})});});
afterEach(cleanup);
describe("attività d’ufficio per ogni azienda",()=>{
 it("mostra la scelta dei responsabili senza attribuire nomi prima della conferma",()=>{
  const onChange=vi.fn();render(<ContractOfficeAssignments companyId="company-a" steps={[{nome:"Contabilità",controlli:[]}]} value={{}} onChange={onChange}/>);
  const select=screen.getByRole("combobox",{name:"Responsabile proposto: Contabilità"});
  expect(select).toHaveValue("");fireEvent.change(select,{target:{value:"office-a"}});expect(onChange).toHaveBeenCalledWith({Contabilità:"office-a"});
  expect(screen.getByText(/richiedono ancora il collegamento/)).toBeVisible();
 });
 it("mantiene da assegnare le attività senza responsabile e impedisce di chiuderle",()=>{
  m.tasks=[{id:"task",title:"Documenti",notes:null,status:"da_fare",assigned_to:null,due_date:null}];
  render(<ContractOfficeTasks orderId="order-a"/>);
  expect(screen.getByRole("status")).toHaveTextContent("1 attività da assegnare");
  expect(screen.getByRole("button",{name:"Completa attività"})).toBeDisabled();
 });
 it("salva una nuova attività d’ufficio nell’azienda e commessa correnti",async()=>{
  render(<ContractOfficeTasks orderId="order-a"/>);fireEvent.click(screen.getByRole("button",{name:"Aggiungi attività d’ufficio"}));
  fireEvent.change(screen.getByRole("textbox",{name:"Titolo attività d’ufficio"}),{target:{value:"Verifica autorizzazione"}});
  fireEvent.change(screen.getByRole("combobox",{name:"Responsabile nuova attività d’ufficio"}),{target:{value:"office-a"}});
  fireEvent.click(screen.getByRole("button",{name:"Crea attività assegnata"}));
  await waitFor(()=>expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({company_id:"company-a",order_id:"order-a",activity_scope:"ufficio",assigned_to:"office-a"})));
 });
 it("in sola lettura non permette nuove assegnazioni o creazioni",()=>{
  m.editable=false;m.tasks=[{id:"task",title:"Documenti",notes:null,status:"da_fare",assigned_to:null,due_date:null}];render(<ContractOfficeTasks orderId="order-a"/>);
  expect(screen.getByRole("combobox",{name:"Responsabile: Documenti"})).toBeDisabled();expect(screen.queryByRole("button",{name:"Aggiungi attività d’ufficio"})).not.toBeInTheDocument();
 });
});
