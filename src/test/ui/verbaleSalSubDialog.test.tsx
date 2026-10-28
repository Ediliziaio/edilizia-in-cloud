import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SALSubappaltatore } from "@/types/subappaltatori";
const s=vi.hoisted(()=>({invoke:vi.fn(),readonly:false,canRead:true,canWrite:true,queryError:false,date:[] as {data_rilievo:string}[]}));
vi.mock("@/hooks/usePermissions",()=>({usePermissions:()=>({canViewSubappaltatoriAmministrazione:s.canRead,canViewCosts:s.canRead,canViewSicurezzaCantiere:false,solaLettura:s.readonly,canEditOrders:s.canWrite})}));
vi.mock("@/components/shared/PdfBlobLivePreviewPanel",()=>({PdfBlobLivePreviewPanel:()=> <div>PDF pronto</div>}));
vi.mock("sonner",()=>({toast:{success:vi.fn()}}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:s.invoke},from:(table:string)=>{
 const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>Promise.resolve({data:table==="subappalto_misure"?s.date:[],error:s.queryError?{message:"no"}:null})};return q;
}}}));
import { VerbaleSalSubDialog } from "@/components/subappaltatori/VerbaleSalSubDialog";
const sal={id:"sal1",company_id:"azienda",contratto_id:"contratto",order_id:"ordine",subappaltatore_id:"sub",numero_sal:2,data_emissione:"2026-10-27",importo_lordo:4000,ritenuta_pct:5,ritenuta_importo:200,importo_netto:3800,stato:"ricevuto"} as SALSubappaltatore;
const chiudi=vi.fn();
const mostra=()=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><VerbaleSalSubDialog companyId="azienda" sal={sal} onClose={chiudi}/></QueryClientProvider>);
const periodo=()=>{fireEvent.change(screen.getByLabelText("Periodo dal"),{target:{value:"2026-10-01"}});fireEvent.change(screen.getByLabelText("Al",{exact:true}),{target:{value:"2026-10-27"}});};
const anteprima=()=>({data:{pdf_base64:btoa("%PDF-test"),anteprima_sha256:"source"},error:null});
afterEach(cleanup);
beforeEach(()=>{s.readonly=false;s.canRead=true;s.canWrite=true;s.queryError=false;s.date=[];chiudi.mockReset();s.invoke.mockReset().mockResolvedValue(anteprima());vi.stubGlobal("URL",Object.assign(URL,{createObjectURL:vi.fn(()=>"blob:demo"),revokeObjectURL:vi.fn()}));});
describe("Verbale SAL sub nel popup",()=>{
 it("richiede il periodo senza inventarlo e archivia soltanto dopo l'anteprima",async()=>{
  mostra();expect(screen.getByLabelText("Periodo dal")).toHaveValue("");expect(screen.getByRole("button",{name:"Anteprima",exact:true})).toBeDisabled();expect(screen.getByRole("button",{name:"Archivia originale"})).toBeDisabled();periodo();fireEvent.click(screen.getByRole("button",{name:"Anteprima",exact:true}));await waitFor(()=>expect(screen.getByTitle("PDF verbale SAL subappalto")).toBeInTheDocument());expect(s.invoke).toHaveBeenCalledWith("genera-verbale-sal-sub",{body:expect.objectContaining({mode:"anteprima",sal_id:"sal1",periodo_dal:"2026-10-01"})});expect(screen.getByRole("button",{name:"Archivia originale"})).toBeEnabled();
  s.invoke.mockResolvedValueOnce({data:{id:"doc",pdf_url:"https://example.invalid/pdf",zip_url:"https://example.invalid/zip",sha256:"hash"},error:null});fireEvent.click(screen.getByRole("button",{name:"Archivia originale"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Pacchetto con originali"})).toBeInTheDocument());expect(s.invoke).toHaveBeenLastCalledWith("genera-verbale-sal-sub",{body:expect.objectContaining({mode:"archivia",anteprima_sha256:"source"})});
 });
 it("una modifica invalida l'anteprima per evitare copie diverse da quanto riesaminato",async()=>{mostra();periodo();fireEvent.click(screen.getByRole("button",{name:"Anteprima",exact:true}));await screen.findByTitle("PDF verbale SAL subappalto");fireEvent.change(screen.getByLabelText("Osservazioni e riserve"),{target:{value:"Nuova riserva"}});expect(screen.queryByTitle("PDF verbale SAL subappalto")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Archivia originale"})).toBeDisabled();});
 it("non dichiara archiviato un fallimento e consente il ritentativo",async()=>{s.invoke.mockResolvedValue({data:null,error:{context:{json:async()=>({error:"Dati cambiati: aggiorna l'anteprima"})}}});mostra();periodo();fireEvent.click(screen.getByRole("button",{name:"Anteprima",exact:true}));expect(await screen.findByRole("alert")).toHaveTextContent("Dati cambiati");expect(screen.queryByRole("button",{name:"Scarica PDF"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Anteprima",exact:true})).toBeEnabled();});
 it("proteggere i dati non archiviati non fa uscire dalla commessa",async()=>{mostra();periodo();fireEvent.click(screen.getByRole("button",{name:"Torna ai SAL"}));expect(await screen.findByRole("alertdialog")).toHaveTextContent("Chiudere senza archiviare?");fireEvent.click(screen.getByText("Continua modifica"));expect(screen.getByLabelText("Periodo dal")).toHaveValue("2026-10-01");expect(chiudi).not.toHaveBeenCalled();});
 it("senza permessi non mostra form o documenti economici",()=>{s.canRead=false;mostra();expect(screen.getByRole("alert")).toHaveTextContent("Non hai il permesso");expect(screen.queryByLabelText("Periodo dal")).not.toBeInTheDocument();expect(s.invoke).not.toHaveBeenCalled();});
 it("la sola lettura consente l'anteprima ma non l'archiviazione",async()=>{s.readonly=true;s.canWrite=false;mostra();periodo();fireEvent.click(screen.getByRole("button",{name:"Anteprima",exact:true}));await screen.findByTitle("PDF verbale SAL subappalto");expect(screen.getByRole("button",{name:"Archivia originale"})).toBeDisabled();});
 it("un errore nell'archivio non appare come nessun verbale",async()=>{s.queryError=true;mostra();expect(await screen.findByRole("alert")).toHaveTextContent("Archivio non disponibile");expect(screen.queryByText("Nessun verbale archiviato per questo SAL.")).not.toBeInTheDocument();});
 it("propone le date delle rilevazioni senza sovrascrivere la scelta dell’operatore",async()=>{
  s.date=[{data_rilievo:'2026-10-20'},{data_rilievo:'2026-10-27'}];mostra();
  await waitFor(()=>expect(screen.getByLabelText('Periodo dal')).toHaveValue('2026-10-20'));
  fireEvent.change(screen.getByLabelText('Periodo dal'),{target:{value:'2026-10-01'}});
  expect(screen.getByLabelText('Periodo dal')).toHaveValue('2026-10-01');
  expect(screen.getByLabelText('Al',{exact:true})).toHaveValue('2026-10-27');
 });

});
