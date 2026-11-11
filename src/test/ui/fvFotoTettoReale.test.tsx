import {useState} from "react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {FotoTettoReale} from "../../../dev/fotovoltaico-locale/FotoTettoReale";
import {edificio,puntoFoto} from "../../../dev/fotovoltaico-locale/campioneReale";
import {creaPianoReale,dalDisegnoAlMondo,type SelezioneReale} from "../../../dev/fotovoltaico-locale/tettoReale";
import {disponiModuliOttimizzati} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
const schema=creaPianoReale(edificio,{corto:1.134,lungo:1.762,stimato:false}),iniziale=disponiModuliOttimizzati(schema,3,"auto",schema.falde[0].id);
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function Monta({lettura=false}:{lettura?:boolean}){
 const [piano,setPiano]=useState(iniziale),[selezione,setSelezione]=useState<SelezioneReale>(null);
 return <><output aria-label="Moduli e selezione">{piano.pannelli.length} / {selezione?.id??"nessuno"}</output><FotoTettoReale piano={piano} onChange={setPiano} modificabile={!lettura} selezione={selezione} onSelezione={setSelezione} onProvvisorio={()=>{}} inquadratura={{faldaId:null,versione:0}}/></>;
}
describe("Pannelli interattivi sulla foto",()=>{
 it("seleziona un modulo dalla tastiera senza modificare la quantità e lo rimuove solo su comando",()=>{
  render(<Monta/>);fireEvent.keyDown(screen.getByRole("button",{name:"Modulo foto 1"}),{key:"Enter"});expect(screen.getByRole("button",{name:"Modulo foto 1"})).toHaveAttribute("aria-pressed","true");expect(screen.getByLabelText("Moduli e selezione")).toHaveTextContent("3 /");
  fireEvent.keyDown(screen.getByRole("button",{name:"Modulo foto 1"}),{key:"Delete"});expect(screen.getByLabelText("Moduli e selezione")).toHaveTextContent("2 / nessuno");
 });
 it("mantiene la quantità in sola lettura e disabilita l’aggiunta",()=>{
  render(<Monta lettura/>);fireEvent.keyDown(screen.getByRole("button",{name:"Modulo foto 1"}),{key:"Delete"});expect(screen.getByLabelText("Moduli e selezione")).toHaveTextContent("3 /");expect(screen.getByRole("button",{name:"Aggiungi pannello sulla foto"})).toBeDisabled();
 });
 it("scarta un trascinamento fuori falda e ripristina la posizione",()=>{
  vi.stubGlobal("PointerEvent",MouseEvent);vi.stubGlobal("DOMPoint",class{constructor(public x:number,public y:number){}matrixTransform(){return{x:this.x,y:this.y};}});
  const {container}=render(<Monta/>),svg=container.querySelector("svg")!;
  Object.defineProperty(svg,"getScreenCTM",{value:()=>({inverse:()=>({})})});Object.defineProperty(svg,"setPointerCapture",{value:()=>{}});
  const m=iniziale.pannelli[0],r={x:m.x+schema.modulo.corto/2,y:m.y+schema.modulo.lungo/2},p=puntoFoto(dalDisegnoAlMondo(edificio,m.faldaId,r)),elemento=screen.getByRole("button",{name:"Modulo foto 1"}),prima=elemento.getAttribute("points");
  fireEvent.pointerDown(elemento,{clientX:p.x,clientY:p.y});fireEvent.pointerMove(svg,{clientX:9000,clientY:9000});fireEvent.pointerUp(svg);
  expect(screen.getByRole("button",{name:"Modulo foto 1"})).toHaveAttribute("points",prima);expect(screen.getByText(/Spostamento annullato/)).toBeTruthy();expect(screen.getByLabelText("Moduli e selezione")).toHaveTextContent("3 /");
 });
});
