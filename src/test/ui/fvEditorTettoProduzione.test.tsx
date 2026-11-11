import {useState} from "react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/react";
import {FvDisegnoPreventivo} from "../../components/fotovoltaico/FvDisegnoPreventivo";
import FvEditorTetto from "../../components/fotovoltaico/tetto/FvEditorTetto";
import {creaDisegnoTetto,disponiModuliAutomaticamente,type DisegnoCommercialeFv} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"company-test"}})}));
vi.mock("@/components/fotovoltaico/tetto/VistaTettoReale3D",()=>({VistaReale:({pannelli}:{pannelli:unknown[]})=><div role="img" aria-label="Vista 3D del tetto">{pannelli.length} moduli in 3D</div>}));
const archivio={salva:vi.fn(async()=>{}),leggi:vi.fn(async()=>{throw Error("Rilievo non disponibile nell’azienda");})};
afterEach(()=>{cleanup();vi.clearAllMocks();});
function Simulazione({readonly=false,rilievo=false}:{readonly?:boolean;rilievo?:boolean}){const [p,setP]=useState<DisegnoCommercialeFv>(()=>({...disponiModuliAutomaticamente(creaDisegnoTetto("due_falde"),12),...(rilievo?{rilievo:{versione:1 as const,id:"rilievo-assente",nome:"Tetto cliente"}}:{})}));return <><FvEditorTetto value={p} onChange={setP} archivio={archivio} modulo={p.modulo} potenzaModuloW={450} quantitaIniziale={12} modificabile={!readonly}/><output aria-label="Moduli confermati">{p.pannelli.length}</output><output aria-label="Altezza salvata">{p.schema3d?.altezza??8}</output></>;}
describe("Editor completo nel preventivatore di produzione",()=>{
 it("passa da 2D a 3D e modifica l’altezza mantenendo moduli, poi riapre la stessa posa",async()=>{render(<Simulazione/>);await screen.findByRole("button",{name:"Vista 3D"});expect(screen.getByRole("button",{name:"Pianta e posa"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Vista 3D"}));expect(screen.getByRole("img",{name:"Vista 3D del tetto"})).toHaveTextContent("12 moduli");fireEvent.change(screen.getByLabelText("Altezza edificio schema"),{target:{value:"18"}});expect(screen.getByLabelText("Altezza salvata")).toHaveTextContent("18");expect(screen.getByLabelText("Moduli confermati")).toHaveTextContent("12");fireEvent.click(screen.getByRole("button",{name:"Pianta e posa"}));expect(screen.getByRole("button",{name:"Modulo 1"})).toBeTruthy();});
 it("offre confronto pose, capannone e importazione senza usare dati campione del cliente",async()=>{render(<Simulazione/>);await screen.findByRole("button",{name:"Vista 3D"});for(const name of ["Confronta pose","Capannone","Rilievo e altezza"])expect(screen.getByRole("button",{name})).toBeTruthy();expect(screen.queryByText(/Delft/)).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Rilievo e altezza"}));expect(screen.getByLabelText("Ortofoto cliente")).toBeTruthy();expect(screen.getByText(/archivio privato dell’azienda/)).toBeTruthy();});
 it("mantiene visualizzabile il 3D in sola lettura senza consentire cambi di quote",async()=>{render(<Simulazione readonly/>);await screen.findByRole("button",{name:"Vista 3D"});fireEvent.click(screen.getByRole("button",{name:"Vista 3D"}));expect(screen.getByRole("img",{name:"Vista 3D del tetto"})).toBeTruthy();expect(screen.getByLabelText("Altezza edificio schema")).toBeDisabled();});
 it("non sostituisce un rilievo mancante con un campione di un altro edificio",async()=>{render(<Simulazione rilievo/>);await waitFor(()=>expect(screen.getByText(/Rilievo non disponibile nell’azienda/)).toBeTruthy());expect(screen.queryByText(/Delft/)).toBeNull();});
});


it("riallinea la quantità della barra quando arriva un nuovo tetto, senza sovrascrivere una richiesta non applicata",()=>{
 const p=disponiModuliAutomaticamente(creaDisegnoTetto("due_falde"),12),props={onChange:vi.fn(),modulo:p.modulo,potenzaModuloW:450,quantitaIniziale:12,modificabile:true};
 const ui=render(<FvDisegnoPreventivo {...props} value={p}/>);fireEvent.change(screen.getByLabelText("Moduli da disporre"),{target:{value:"20"}});
 const nuovo=disponiModuliAutomaticamente(creaDisegnoTetto("singola",40,20),160);ui.rerender(<FvDisegnoPreventivo {...props} value={nuovo}/>);expect(screen.getByLabelText("Moduli da disporre")).toHaveValue(160);
 fireEvent.change(screen.getByLabelText("Moduli da disporre"),{target:{value:"180"}});ui.rerender(<FvDisegnoPreventivo {...props} value={{...nuovo,schema3d:{altezza:18,pendenza:20}}}/>);expect(screen.getByLabelText("Moduli da disporre")).toHaveValue(180);
});
