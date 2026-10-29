import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ContractOfficeAssignments} from "@/components/orders/ContractOfficeAssignments";
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
});
