import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ContractInterventions} from "@/components/orders/ContractInterventions";
const m=vi.hoisted(()=>({kind:"contratto",rpc:vi.fn(),navigate:vi.fn()}));
vi.mock("react-router-dom",()=>({Link:({to,children}:any)=><a href={to}>{children}</a>,useNavigate:()=>m.navigate}));
vi.mock("@/hooks/useOrderContractLink",()=>({useOrderContractLink:()=>({data:{workflow_kind:m.kind,parent_contract_id:"parent",intervention_reference:"ORD-1"}})}));
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"company-a"}})}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditOrders:true})}));
vi.mock("@/hooks/useContractWorkflowProfile",()=>({useContractWorkflowProfile:()=>({data:"manutenzione_stradale_su_ordine"})}));
vi.mock("@/hooks/useModelliFasi",()=>({useModelliFasi:()=>({modelli:[] as never[]})}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:m.rpc}}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>({data:[] as never[],isError:false,isLoading:false}),useQueryClient:()=>({invalidateQueries:vi.fn()}),useMutation:(c:any)=>({isPending:false,mutate:async()=>{try{const d=await c.mutationFn();c.onSuccess?.(d);}catch(e){c.onError?.(e);}}})}));
beforeEach(()=>{m.kind="contratto";m.rpc.mockReset();m.navigate.mockReset();m.rpc.mockResolvedValue({data:"child",error:null});});afterEach(cleanup);
describe("contratto e interventi operativi",()=>{
 it("un intervento rimanda al contratto e separa gli importi dalle lavorazioni",()=>{
  m.kind="intervento";render(<ContractInterventions orderId="child"/>);expect(screen.getByRole("link",{name:"Apri il contratto di origine"})).toHaveAttribute("href","/azienda/ordini/parent");expect(screen.getByText(/Importi, IVA, SAL/)).toBeVisible();expect(screen.queryByRole("button",{name:"Nuovo intervento da ordine"})).not.toBeInTheDocument();
 });
 it("una ripetizione dopo un errore usa lo stesso id e non inventa date o pagamenti",async()=>{
  m.rpc.mockResolvedValueOnce({data:null,error:new Error("Rete interrotta")}).mockResolvedValueOnce({data:"child",error:null});
  render(<ContractInterventions orderId="parent"/>);fireEvent.click(screen.getByRole("button",{name:"Nuovo intervento da ordine"}));
  fireEvent.change(screen.getByRole("textbox",{name:"Riferimento ordine / PED *"}),{target:{value:"PROVA-1"}});
  fireEvent.change(screen.getByRole("textbox",{name:"Descrizione intervento *"}),{target:{value:"Prova fresatura"}});
  fireEvent.change(screen.getByRole("textbox",{name:"Strada, tratto / progressive, luogo *"}),{target:{value:"Tratto di prova"}});
  fireEvent.click(screen.getByRole("button",{name:"Crea intervento e apri le lavorazioni"}));await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button",{name:"Crea intervento e apri le lavorazioni"}));await waitFor(()=>expect(m.rpc).toHaveBeenCalledTimes(2));
  const first=m.rpc.mock.calls[0][1],second=m.rpc.mock.calls[1][1];expect(first.p_id).toBe(second.p_id);expect(first).toMatchObject({p_company_id:"company-a",p_contract_id:"parent",p_template_id:null,p_dati:{start:"",end:""}});expect(first.p_dati).not.toHaveProperty("total_amount");expect(first.p_dati).not.toHaveProperty("iva_pct");
 });
});
