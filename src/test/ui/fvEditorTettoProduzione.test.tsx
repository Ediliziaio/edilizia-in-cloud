import {useState} from "react";
import {describe,it,expect,vi,afterEach} from "vitest";
import {render,screen,fireEvent,cleanup,waitFor} from "@testing-library/react";
import {FvDisegnoPreventivo} from "../../components/fotovoltaico/FvDisegnoPreventivo";
import FvEditorTetto from "../../components/fotovoltaico/tetto/FvEditorTetto";
import { pianoDaMappaFv } from "../../components/fotovoltaico/tetto/mappaGeometria";
import {creaDisegnoTetto,disponiModuliAutomaticamente,type DisegnoCommercialeFv} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
vi.mock("@/contexts/AuthContext",()=>({useAuth:()=>({effectiveCompany:{id:"company-test"}})}));
vi.mock("@/components/fotovoltaico/tetto/VistaTettoReale3D",()=>({VistaReale:({pannelli}:{pannelli:unknown[]})=><div role="img" aria-label="Vista 3D del tetto">{pannelli.length} moduli in 3D</div>}));
const archivio={salva:vi.fn(async()=>{}),leggi:vi.fn(async()=>{throw Error("Rilievo non disponibile nell’azienda");})};
afterEach(()=>{cleanup();vi.clearAllMocks();});
function Simulazione({readonly=false,rilievo=false,capannone=false}:{readonly?:boolean;rilievo?:boolean;capannone?:boolean}){const [p,setP]=useState<DisegnoCommercialeFv>(()=>({...disponiModuliAutomaticamente(creaDisegnoTetto("due_falde"),12),...(rilievo?{rilievo:{versione:1 as const,id:"rilievo-assente",nome:"Tetto cliente"}}:{})}));return <><FvEditorTetto value={p} onChange={setP} archivio={archivio} modulo={p.modulo} potenzaModuloW={450} quantitaIniziale={12} modificabile={!readonly} consentiCapannone={capannone}/><output aria-label="Moduli confermati">{p.pannelli.length}</output><output aria-label="Altezza salvata">{p.schema3d?.altezza??8}</output></>;}
describe("Editor completo nel preventivatore di produzione",()=>{
 it("passa da 2D a 3D e modifica l’altezza mantenendo moduli, poi riapre la stessa posa",async()=>{render(<Simulazione/>);await screen.findByRole("button",{name:"Vista 3D"});expect(screen.getByRole("button",{name:"Pianta e posa"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Vista 3D"}));expect(screen.getByRole("img",{name:"Vista 3D del tetto"})).toHaveTextContent("12 moduli");fireEvent.change(screen.getByLabelText("Altezza edificio schema"),{target:{value:"18"}});expect(screen.getByLabelText("Altezza salvata")).toHaveTextContent("18");expect(screen.getByLabelText("Moduli confermati")).toHaveTextContent("12");fireEvent.click(screen.getByRole("button",{name:"Pianta e posa"}));expect(screen.getByRole("button",{name:"Modulo 1"})).toBeTruthy();});
 it("offre confronto pose e importazione senza strumenti industriali nel residenziale",async()=>{render(<Simulazione/>);await screen.findByRole("button",{name:"Vista 3D"});for(const name of ["Confronta pose","Rilievo e altezza"])expect(screen.getByRole("button",{name})).toBeTruthy();expect(screen.queryByRole("button",{name:"Capannone"})).toBeNull();expect(screen.queryByRole("button",{name:"Foto sul tetto"})).toBeNull();expect(screen.queryByText(/Delft/)).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Rilievo e altezza"}));expect(screen.getByLabelText("Ortofoto cliente")).toBeTruthy();expect(screen.getByText(/archivio privato dell’azienda/)).toBeTruthy();});
 it("mantiene visualizzabile il 3D in sola lettura senza consentire cambi di quote",async()=>{render(<Simulazione readonly/>);await screen.findByRole("button",{name:"Vista 3D"});fireEvent.click(screen.getByRole("button",{name:"Vista 3D"}));expect(screen.getByRole("img",{name:"Vista 3D del tetto"})).toBeTruthy();expect(screen.getByLabelText("Altezza edificio schema")).toBeDisabled();});
 it("non sostituisce un rilievo mancante con un campione di un altro edificio",async()=>{render(<Simulazione rilievo/>);await waitFor(()=>expect(screen.getByText(/Rilievo non disponibile nell’azienda/)).toBeTruthy());expect(screen.queryByText(/Delft/)).toBeNull();});
});


it("riallinea la quantità della barra quando arriva un nuovo tetto, senza sovrascrivere una richiesta non applicata",()=>{
 const p=disponiModuliAutomaticamente(creaDisegnoTetto("due_falde"),12),props={onChange:vi.fn(),modulo:p.modulo,potenzaModuloW:450,quantitaIniziale:12,modificabile:true};
 const ui=render(<FvDisegnoPreventivo {...props} value={p}/>);fireEvent.change(screen.getByLabelText("Moduli da disporre"),{target:{value:"20"}});
 const nuovo=disponiModuliAutomaticamente(creaDisegnoTetto("singola",40,20),160);ui.rerender(<FvDisegnoPreventivo {...props} value={nuovo}/>);expect(screen.getByLabelText("Moduli da disporre")).toHaveValue(160);
 fireEvent.change(screen.getByLabelText("Moduli da disporre"),{target:{value:"180"}});ui.rerender(<FvDisegnoPreventivo {...props} value={{...nuovo,schema3d:{altezza:18,pendenza:20}}}/>);expect(screen.getByLabelText("Moduli da disporre")).toHaveValue(180);
});

it("mostra la progettazione industriale quando il preventivo è per un capannone",async()=>{render(<Simulazione capannone/>);expect(await screen.findByRole("button",{name:"Capannone"})).toBeTruthy();});

it("la casa usa la falda sulla mappa e ignora un vecchio rilievo rimasto associato",async()=>{
 const p=pianoDaMappaFv({versione:1,origine:{lat:45,lng:9},ricerca:{indirizzo:"Collaudo",posizione:{lat:45,lng:9}},distanzaOstacoli:.3,falde:[{id:"f-cliente",nome:"Tetto reale a L",punti:[{x:0,y:0},{x:12,y:0},{x:12,y:4},{x:6,y:4},{x:6,y:8},{x:0,y:8}],inclinazione:25,azimut:180,inclinazioneStimata:true}]},{corto:1.134,lungo:1.762,stimato:true});
 p.rilievo={versione:1,id:"vecchio-edificio",nome:"Rilievo precedente"};
 render(<FvEditorTetto value={p} onChange={vi.fn()} archivio={archivio} modulo={p.modulo} potenzaModuloW={450} quantitaIniziale={6} modificabile/>);
 const casa=await screen.findByRole("button",{name:"Vista della casa"});
 expect(archivio.leggi).not.toHaveBeenCalled();
 fireEvent.click(casa);
 const svg=screen.getByRole("img",{name:"Vista 3D del tetto disegnato con i pannelli"});
 expect(svg.querySelector('[data-fv-roof="f-cliente"]')).toBeTruthy();
 expect(svg.querySelector('[data-fv-roof="f-cliente"]')!.getAttribute("points")!.split(" ")).toHaveLength(6);
 fireEvent.click(screen.getByRole("button",{name:"Vista 3D"}));
 expect(screen.getByLabelText("Altezza gronda sulla mappa")).toBeTruthy();
 expect(archivio.leggi).not.toHaveBeenCalled();
});
