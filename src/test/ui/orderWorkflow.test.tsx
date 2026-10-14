import "@testing-library/jest-dom/vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MemoryRouter} from "react-router-dom";
import {OrderStatusWorkflow} from "@/components/orders/OrderStatusWorkflow";
import {ORDER_WORKFLOW_MODELS} from "@/lib/orders/workflowModels";
const state=vi.hoisted(()=>({save:vi.fn(),refresh:vi.fn(),change:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{}}));
vi.mock("@/lib/orders/workflowPersistence",()=>({saveOrderWorkflow:(...args:unknown[])=>state.save(...args)}));
beforeEach(()=>{vi.clearAllMocks();state.save.mockResolvedValue({id:"order",tipo_lavoro:"fotovoltaico",version:4});state.refresh.mockResolvedValue(undefined);});
afterEach(cleanup);
const draw=(props={})=>render(<MemoryRouter><OrderStatusWorkflow orderId="order" companyId="company" version={3} statuses={[{id:"s1",name:"Acconto Pagato",color:"#123456",position:0}]} currentStatusId="s1" canEdit onStatusChange={state.change} onRefresh={state.refresh} {...props}/></MemoryRouter>);
describe("Percorsi della singola commessa",()=>{
  it("le lavorazioni suggeriscono un passaggio solo dopo un click, tramite la conferma esistente",()=>{
    const statuses=ORDER_WORKFLOW_MODELS[0].statuses.map((s,i)=>({id:`p${i}`,name:s.name,color:s.color,position:i}));
    draw({modelKey:"ristrutturazione",statuses,currentStatusId:"p3",workProgress:{total:2,done:2,inCorso:0,avgPct:100}});
    expect(state.change).not.toHaveBeenCalled();expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Valuta «Verifiche Finali»"}));expect(state.change).toHaveBeenCalledExactlyOnceWith("p4");expect(state.save).not.toHaveBeenCalled();
  });
  it("anteprima non salva; conferma salva il modello senza cambiare stato o costi",async()=>{
    draw();fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));
    fireEvent.change(screen.getByLabelText("Percorso operativo"),{target:{value:"fotovoltaico"}});
    expect(screen.getByRole("list",{name:"Tappe del percorso"})).toHaveTextContent("Installata, da Attivare");
    expect(state.save).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Salva percorso"}));
    await waitFor(()=>expect(state.refresh).toHaveBeenCalledOnce());
    expect(state.save).toHaveBeenCalledWith({}, {orderId:"order",companyId:"company",version:3,modelKey:"fotovoltaico"});
    expect(state.change).not.toHaveBeenCalled();
  });
  it("permessi e versione mancante bloccano le scritture",()=>{
    draw({canEdit:false,onStatusChange:undefined});expect(screen.queryByRole("button",{name:"Cambia percorso"})).not.toBeInTheDocument();
    cleanup();draw({version:undefined});fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));fireEvent.change(screen.getByLabelText("Percorso operativo"),{target:{value:"fotovoltaico"}});
    expect(screen.getByRole("button",{name:"Salva percorso"})).toBeDisabled();
  });
  it("la sola lettura resta protetta anche se il chiamante passa erroneamente una callback di modifica",()=>{
    draw({canEdit:false,currentStatusId:null});
    expect(screen.getByRole("button",{name:'Imposta stato "Acconto Pagato"'})).toBeDisabled();
    fireEvent.click(screen.getByRole("button",{name:'Imposta stato "Acconto Pagato"'}));expect(state.change).not.toHaveBeenCalled();
  });
  it("errore o conflitto conservano la scelta senza annunciare un successo",async()=>{
    state.save.mockRejectedValue(new Error("Commessa modificata altrove"));draw();fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));fireEvent.change(screen.getByLabelText("Percorso operativo"),{target:{value:"fotovoltaico"}});fireEvent.click(screen.getByRole("button",{name:"Salva percorso"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("modificata altrove");expect(screen.getByLabelText("Percorso operativo")).toHaveValue("fotovoltaico");expect(state.refresh).not.toHaveBeenCalled();
  });
  it("se la scrittura riesce ma l'aggiornamento fallisce, non invita a risalvare né duplica la richiesta",async()=>{
    state.refresh.mockRejectedValue(new Error("Rete"));draw();fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));fireEvent.change(screen.getByLabelText("Percorso operativo"),{target:{value:"fotovoltaico"}});fireEvent.click(screen.getByRole("button",{name:"Salva percorso"}));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Percorso salvato, ma/);expect(screen.getByRole("button",{name:"Salva percorso"})).toBeDisabled();expect(state.save).toHaveBeenCalledOnce();
  });
  it("durante il salvataggio blocca input e richieste ripetute",async()=>{
    let done!:()=>void;state.save.mockImplementation(()=>new Promise<void>(r=>{done=r;}));draw();fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));fireEvent.change(screen.getByLabelText("Percorso operativo"),{target:{value:"fotovoltaico"}});fireEvent.click(screen.getByRole("button",{name:"Salva percorso"}));
    fireEvent.click(screen.getByRole("button",{name:"Salvataggio…"}));expect(state.save).toHaveBeenCalledOnce();expect(screen.getByLabelText("Percorso operativo")).toBeDisabled();done();await waitFor(()=>expect(state.refresh).toHaveBeenCalledOnce());
  });
  it("modello incompleto conserva tutti gli stati e il tipo preesistente non riconosciuto",()=>{
    draw({modelKey:"custom"});expect(screen.getByText("Tipo esistente: custom")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));expect(screen.getByLabelText("Percorso operativo")).toHaveValue("custom");expect(state.save).not.toHaveBeenCalled();
    cleanup();draw({modelKey:"fotovoltaico"});expect(screen.getByText(/Mancano 6 tappe/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Stato attuale: Acconto Pagato"})).toBeInTheDocument();
  });
  it("il cambio di un tipo personalizzato richiede una scelta esplicita e ne chiarisce l'effetto",()=>{
    draw({modelKey:"riqualificazione_energetica"});fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));
    expect(screen.getByLabelText("Percorso operativo")).toHaveValue("riqualificazione_energetica");
    fireEvent.change(screen.getByLabelText("Percorso operativo"),{target:{value:"tetti"}});
    expect(screen.getByText(/Confermando, il tipo di lavoro/)).toHaveTextContent("riqualificazione energetica");expect(state.save).not.toHaveBeenCalled();
  });
  it("un percorso completo lascia uno stato legacy attuale accessibile negli stati aggiuntivi",()=>{
    const statuses=ORDER_WORKFLOW_MODELS[0].statuses.map((s,i)=>({id:`p${i}`,name:s.name,color:s.color,position:i}));draw({modelKey:"ristrutturazione",statuses:[...statuses,{id:"s1",name:"Acconto Pagato",color:"#123456",position:10}]});
    fireEvent.click(screen.getByText("Altri stati aziendali e assistenza (1)"));expect(screen.getByRole("button",{name:"Stato attuale: Acconto Pagato"})).toBeVisible();expect(state.change).not.toHaveBeenCalled();
  });
  it("aggiornamenti concorrenti del percorso non sovrascrivono la bozza",()=>{
    const ui=draw();fireEvent.click(screen.getByRole("button",{name:"Cambia percorso"}));fireEvent.change(screen.getByLabelText("Percorso operativo"),{target:{value:"fotovoltaico"}});
    ui.rerender(<MemoryRouter><OrderStatusWorkflow orderId="order" companyId="company" version={4} modelKey="generico" statuses={[]} currentStatusId={null} canEdit onRefresh={state.refresh}/></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent(/altra sessione/);expect(screen.getByRole("button",{name:"Salva percorso"})).toBeDisabled();expect(screen.getByLabelText("Percorso operativo")).toHaveValue("fotovoltaico");
  });
});
