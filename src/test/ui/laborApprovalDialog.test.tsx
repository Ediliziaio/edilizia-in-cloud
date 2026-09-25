import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {LaborApprovalDialog} from "@/components/orders/LaborApprovalDialog";
import {reviewLaborReport,type LaborReport,type LaborEmployee} from "@/lib/campo/laborCostReview";
const state=vi.hoisted(()=>({data:undefined as unknown,isError:false,isFetching:false,refetch:vi.fn(),approve:vi.fn(),close:vi.fn()}));
vi.mock("@/lib/campo/loadLaborReview",()=>({loadLaborReview:vi.fn()}));
vi.mock("@tanstack/react-query",()=>({useQuery:()=>({data:state.data,isError:state.isError,isFetching:state.isFetching,isPending:!state.data&&!state.isError,refetch:state.refetch,error:new Error("Lettura fallita")})}));
const target:LaborReport={id:"r",company_id:"c",order_id:"A",user_id:"u",data_lavoro:"2026-09-24",stato:"inviato",updated_at:"v",ore_lavorate:4};
const employee:LaborEmployee={id:"e",user_id:"u",first_name:"Mario",last_name:"Rossi",costo_orario:25};
const draw=(costs=true)=>render(<LaborApprovalDialog companyId="c" orderId="A" reportId="r" showCosts={costs} busy={false} onApprove={state.approve} onClose={state.close}/>);
const seed=(overrides:Partial<LaborReport>={},others:LaborReport[]=[],employees=[employee],costs=true)=>{state.data={target,fingerprint:"v1",...reviewLaborReport({...target,...overrides},others,employees,costs)};};
beforeEach(()=>{vi.clearAllMocks();state.isError=false;state.isFetching=false;seed();});afterEach(cleanup);
describe("Controllo prima di approvare",()=>{
  it("confronta budget e registrato senza trasformare la stima in costo definitivo",()=>{
    state.data={...state.data as object,budget:{planned:500,registered:450}};draw();
    expect(screen.getByText("Budget manodopera interna")).toBeInTheDocument();
    expect(screen.getByText("Già registrato sulla commessa")).toBeInTheDocument();
    expect(screen.getByText(/la stima supera il budget/)).toHaveTextContent("50,00");
  });
  it("mostra tariffa, ore e stima senza confonderli col budget",()=>{
    draw();expect(screen.getByText(/25,00/)).toBeInTheDocument();expect(screen.getByText(/Manodopera interna stimata/)).toHaveTextContent("100,00");
    expect(screen.getByText(/non il budget né un pagamento/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Conferma approvazione"}));expect(state.approve).toHaveBeenCalledWith("v1",false);
  });
  it("richiede un riscontro esplicito per sovrapposizioni capo/operaio",()=>{
    seed({},[{...target,id:"capo",user_id:"capo",stato:"approvato",presenze:[{employee_id:"e",ore:4}]}]);draw();
    expect(screen.getByText("Possibile doppio conteggio")).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Conferma approvazione"})).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Conferma approvazione"}));
    expect(state.approve).toHaveBeenCalledWith("v1",true);
  });
  it("una tariffa mancante resta non determinabile, non costo zero confermato",()=>{
    seed({},[],[{...employee,costo_orario:null}]);draw();expect(screen.getByText(/Costo stimato: Non determinabile/)).toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Conferma approvazione"})).toBeDisabled();
  });
  it("non carica o mostra informazioni economiche nel riepilogo operativo",()=>{
    seed({},[],[employee],false);draw(false);expect(screen.queryByText(/Costo stimato/)).not.toBeInTheDocument();
    expect(screen.queryByText(/25,00/)).not.toBeInTheDocument();expect(screen.getByText(/non visualizzare le tariffe/)).toBeInTheDocument();
  });
  it("non consente di aggirare un totale giornaliero oltre 24 ore",()=>{
    seed({ore_lavorate:20},[{...target,id:"b",order_id:"B",ore_lavorate:8}]);draw();
    expect(screen.getByRole("alert")).toHaveTextContent("24 ore");expect(screen.getByRole("button",{name:"Conferma approvazione"})).toBeDisabled();
  });
  it("errore e caricamento non diventano controllo superato",()=>{
    state.isError=true;draw();expect(screen.getByRole("alert")).toHaveTextContent("Nessuna approvazione");expect(screen.getByRole("button",{name:"Conferma approvazione"})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:"Aggiorna controllo"}));expect(state.refetch).toHaveBeenCalled();
  });
  it("revoca la conferma degli avvisi quando cambia la versione letta",()=>{
    seed({},[{...target,id:"other"}]);const page=draw();fireEvent.click(screen.getByRole("checkbox"));
    state.data={...state.data as object,fingerprint:"v2"};page.rerender(<LaborApprovalDialog companyId="c" orderId="A" reportId="r" showCosts busy={false} onApprove={state.approve} onClose={state.close}/>);
    expect(screen.getByRole("checkbox")).not.toBeChecked();expect(screen.getByRole("button",{name:"Conferma approvazione"})).toBeDisabled();
  });
  it("annullare non approva nulla",()=>{draw();fireEvent.click(screen.getByRole("button",{name:"Annulla"}));expect(state.close).toHaveBeenCalled();expect(state.approve).not.toHaveBeenCalled();});
});
