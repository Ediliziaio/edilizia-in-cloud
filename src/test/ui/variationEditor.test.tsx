import "@testing-library/jest-dom/vitest";
import {useState} from "react";
import {cleanup,render,screen,fireEvent,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {OdVSection} from "@/components/orders/OdVSection";
import {VariationEditor} from "@/components/orders/VariationEditor";
import {emptyVariationDraft} from "@/lib/orders/variationDraft";
const mock=vi.hoisted(()=>({request:vi.fn(),open:vi.fn(),canEdit:true,insert:vi.fn(),invoke:vi.fn(),refetch:vi.fn(),rows:[] as unknown[],session:vi.fn(),query:vi.fn()}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canEditOrders:mock.canEdit})}));
vi.mock("@/hooks/useVariationTemplates",()=>({useVariationTemplates:()=>({data:[] as unknown[],isError:false,refetch:vi.fn()})}));
vi.mock("@/hooks/useOrderVariations",()=>({useOrderVariations:()=>({data:mock.rows,isLoading:false,isError:false,refetch:mock.refetch})}));
vi.mock("@/components/shared/EntityCustomFieldsSection",()=>({EntityCustomFieldsSection:(): null =>null}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:async()=>({data:false,error:null as null}),auth:{getSession:()=>mock.session()},functions:{invoke:mock.invoke},from:(table:string)=> table === "ordini_variazione" ? {insert:(payload:unknown)=>{mock.insert(payload);return {select:()=>({single:()=>mock.query(payload)})};}} : {select:()=>({eq:()=>({eq:()=>({order:async()=>({data:[{id:"phase",name:"Opere murarie"}],error:null as null})})})})}}}));
vi.mock("@/hooks/useVariationWorkflow",()=>({useVariationWorkflow:()=>({request:mock.request,open:mock.open})}));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel",()=>({PdfBlobLivePreviewPanel:()=> <div>PDF conservato</div>}));
beforeEach(()=>{vi.clearAllMocks();mock.canEdit=true;mock.rows=[];mock.session.mockResolvedValue({data:{session:{user:{id:"user"}}}});mock.query.mockImplementation(async payload=>({data:{id:"created",...payload},error:null as null}));});
afterEach(cleanup);
const draw=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><OdVSection orderId="order" companyId="company" context={{currentNet:1000,vatRate:10,customerName:"Mario",companyName:"Impresa DEMO",orderCode:"ORD-DEMO"}}/></QueryClientProvider>);
const fill=()=>{fireEvent.change(screen.getByLabelText("Titolo *"),{target:{value:"TEST extra"}});fireEvent.change(screen.getByLabelText("Lavori e condizioni *"),{target:{value:"TEST modifica"}});fireEvent.change(screen.getByLabelText(/IVA esclusa/),{target:{value:"120,50"}});};
describe("Composizione della variante",()=>{
  it("salva una bozza sul server senza creare link né inviare email",async()=>{
    mock.request.mockImplementation(async(id,action,payload)=>({success:true,variation:{id,status:"bozza",numero_odv:1},workspace:{revision:1,content:payload.content},document:null}));
    draw();fireEvent.click(screen.getByRole("button",{name:"Nuova variante"}));fill();
    fireEvent.change(screen.getByLabelText(/Note interne/),{target:{value:"INTERNO"}});
    fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
    await waitFor(()=>expect(mock.request).toHaveBeenCalledOnce());
    expect(mock.request.mock.calls[0][1]).toBe("save");
    expect(mock.request.mock.calls[0][2].content).toMatchObject({title:"TEST extra",internalNotes:"INTERNO",amount:"120,50"});
    expect(mock.insert).not.toHaveBeenCalled();expect(mock.invoke).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("Bozza salvata");
  });
  it("permessi di sola lettura non espongono la creazione",()=>{mock.canEdit=false;draw();expect(screen.queryByRole("button",{name:"Nuova variante"})).not.toBeInTheDocument();});
  it("un conflitto mantiene i dati digitati e non prepara il PDF",async()=>{
    mock.request.mockRejectedValue(new Error("Bozza modificata da un altro utente. Riaprila"));
    draw();fireEvent.click(screen.getByRole("button",{name:"Nuova variante"}));fill();
    fireEvent.click(screen.getByRole("button",{name:"Prepara PDF da inviare"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("altro utente");
    expect(screen.getByLabelText("Titolo *")).toHaveValue("TEST extra");
    expect(mock.open).not.toHaveBeenCalled();expect(mock.insert).not.toHaveBeenCalled();
  });
  it("il doppio clic non produce due salvataggi concorrenti",async()=>{
    mock.request.mockReturnValue(new Promise(()=>{}));draw();fireEvent.click(screen.getByRole("button",{name:"Nuova variante"}));fill();
    fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));fireEvent.click(screen.getByRole("button",{name:"Salva bozza"}));
    expect(mock.request).toHaveBeenCalledOnce();expect(screen.getAllByRole("button",{name:"Chiudi"}).some(button=>(button as HTMLButtonElement).disabled)).toBe(true);
  });
  it("rifiuta una proposta incompleta prima di inviare al server",async()=>{
    draw();fireEvent.click(screen.getByRole("button",{name:"Nuova variante"}));fireEvent.click(screen.getByRole("button",{name:"Prepara PDF da inviare"}));
    expect(await screen.findByRole("alert")).toBeInTheDocument();expect(mock.request).not.toHaveBeenCalled();
  });
  it("le bozze già salvate si riaprono senza alterare lo stato",async()=>{
    mock.rows=[{id:"draft",status:"bozza",titolo:"Bozza salvata",descrizione:"Extra",impatto_economico:50,numero_odv:1}];
    mock.request.mockResolvedValue({success:true,variation:{id:"draft",status:"bozza",numero_odv:1},workspace:{revision:2,content:{...emptyVariationDraft(),title:"Bozza salvata",description:"Extra",amount:"50"}},document:null});
    draw();fireEvent.click(screen.getByRole("button",{name:"Riprendi bozza"}));
    await waitFor(()=>expect(screen.getByLabelText("Titolo *")).toHaveValue("Bozza salvata"));
    expect(mock.request).toHaveBeenCalledExactlyOnceWith("draft","load");expect(mock.insert).not.toHaveBeenCalled();
  });
  it("una proposta già registrata si scarica anche senza token, senza alcuna scrittura o invio",async()=>{
    mock.rows=[{id:"odv",order_id:"order",company_id:"company",status:"in_attesa",titolo:"Extra registrato",descrizione:"Opere extra",motivazione:null,impatto_economico:75,impatto_giorni:2,numero_odv:4,firma_token:null,created_at:"2026-10-09T08:30:00Z",note_interne:"SEGRETO",firma_cliente:null}];
    draw();fireEvent.click(screen.getByRole("button",{name:"Proposta PDF"}));
    expect(screen.queryByRole("button",{name:"Invia per email"})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Prepara proposta PDF"}));
    const link=await screen.findByRole("link",{name:"Scarica proposta PDF"});
    const pdf=atob(link.getAttribute("href")!.split(",")[1]);expect(pdf).toContain("OdV #4");expect(pdf).toContain("2 giorni");expect(pdf).not.toContain("SEGRETO");
    expect(link.getAttribute("download")).toContain("OdV-4");expect(mock.insert).not.toHaveBeenCalled();expect(mock.invoke).not.toHaveBeenCalled();expect(mock.session).not.toHaveBeenCalled();
  });
  it("rifiuto e data corrotta non vengono presentati come firme",()=>{
    mock.rows=[{id:"odv",status:"rifiutato",titolo:"Extra",descrizione:"Opere",impatto_economico:50,numero_odv:1,firmato_il:"2026-10-13T23:30:00Z"},
      {id:"bad",status:"approvato",titolo:"Altro",descrizione:"Opere",impatto_economico:10,numero_odv:2,firmato_il:"broken"}];
    draw();expect(screen.getByText("Rifiutato 14/10/2026")).toBeInTheDocument();expect(screen.queryByText(/^Firmato/)).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Proposta PDF"})).not.toBeInTheDocument();
  });
});
describe("Dettaglio voci e riservatezza",()=>{
  function Editor(){const [draft,setDraft]=useState(emptyVariationDraft);return <VariationEditor draft={draft} setDraft={setDraft} phases={[]} context={{}} busy={false} review={false} onBack={()=>{}}/>;}
  it("prezzo a corpo resta semplice e voci sono disponibili solo su richiesta",()=>{
    render(<Editor/>);expect(screen.queryByLabelText("Quantità")).not.toBeInTheDocument();fireEvent.change(screen.getByLabelText("Come definisci il prezzo"),{target:{value:"voci"}});fireEvent.click(screen.getByRole("button",{name:"Aggiungi voce"}));expect(screen.getByLabelText("Quantità")).toHaveValue("1");fireEvent.click(screen.getByRole("button",{name:"Rimuovi voce 1"}));expect(screen.queryByLabelText("Quantità")).not.toBeInTheDocument();
  });
  it("il PDF disponibile segue il contenuto attuale, escludendo costo e note interne",async()=>{
    function Preview(){const [draft,setDraft]=useState({...emptyVariationDraft(),title:"Extra TEST",description:"Contenuto cliente",amount:"25",internalNotes:"SEGRETO_NON_ESPORTARE",estimatedCost:"123,45"});const [review,setReview]=useState(true);return <><VariationEditor draft={draft} setDraft={setDraft} phases={[]} context={{vatRate:10}} busy={false} review={review} onBack={()=>setReview(false)}/>{!review&&<button onClick={()=>setReview(true)}>Rivedi</button>}</>;}
    render(<Preview/>);fireEvent.click(screen.getByRole("button",{name:"Prepara anteprima PDF"}));
    const href=(await screen.findByRole("link",{name:"Scarica PDF pronto"})).getAttribute("href")!;
    const pdf=atob(href.split(",")[1]);expect(pdf).toContain("Contenuto cliente");expect(pdf).not.toContain("SEGRETO_NON_ESPORTARE");expect(pdf).not.toContain("123,45");
    fireEvent.click(screen.getByRole("button",{name:"Modifica bozza"}));fireEvent.change(screen.getByLabelText("Lavori e condizioni *"),{target:{value:"Nuovo contenuto cliente"}});fireEvent.click(screen.getByRole("button",{name:"Rivedi"}));
    expect(screen.queryByRole("link",{name:"Scarica PDF pronto"})).not.toBeInTheDocument();
  });
});
