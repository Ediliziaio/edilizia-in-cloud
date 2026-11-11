import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {CapannoneLocale} from "../../../dev/fotovoltaico-locale/CapannoneLocale";
import {fonteCapannone,configuraCapannone,CAPANNONE_BASE,POSA_BASE} from "../../../dev/fotovoltaico-locale/capannone";
import {pannelliDaRivedere} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
const {invoke}=vi.hoisted(()=>({invoke:vi.fn(async()=>({data:{ore_sole_annue_equivalenti:1500},error:null}))}));
vi.mock("../../../dev/fotovoltaico-locale/services",()=>({supabase:{functions:{invoke}}}));
const fonte=fonteCapannone(CAPANNONE_BASE),piano=configuraCapannone(fonte,{corto:1.134,lungo:1.762,stimato:false},POSA_BASE,600,1.2),runtime={edificio:fonte.edificioBase,fonte,modello:null as null,orto:null as null};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("Comandi industriali nel disegno",()=>{
 it("applica la posa al rilievo con tutti gli ostacoli e i costi selezionati",async()=>{
  const onChange=vi.fn();render(<CapannoneLocale piano={piano} runtime={runtime} modificabile onChange={onChange} potenzaModuloW={450} localita={{lat:45,lng:9}} riepilogoProposta={undefined}/>);
  fireEvent.change(screen.getByRole("combobox",{name:"Posa industriale"}),{target:{value:"est_ovest"}});fireEvent.change(screen.getByLabelText("Inverter aggiuntivi · quantità"),{target:{value:"2"}});fireEvent.click(screen.getByRole("button",{name:"Applica posa al rilievo attuale"}));
  await waitFor(()=>expect(onChange).toHaveBeenCalledTimes(1));const next=onChange.mock.calls[0][0];expect(next.industriale.posa).toBe("est_ovest");expect(next.industriale.costi.inverterAggiuntivi).toBe(2);expect(next.ostacoli).toEqual(piano.ostacoli);expect(next.pannelli).toHaveLength(600);expect(pannelliDaRivedere(next)).toEqual([]);
 });
 it("confronta senza cambiare la bozza, usando le esposizioni effettive",async()=>{
  const onChange=vi.fn();render(<CapannoneLocale piano={piano} runtime={runtime} modificabile onChange={onChange} potenzaModuloW={450} localita={{lat:45,lng:9}} riepilogoProposta={p=>({kwp:p.pannelli.length*.45,totale:p.pannelli.length*200})}/>);
  fireEvent.click(screen.getByRole("button",{name:"Confronta capacità su tetto piano"}));await waitFor(()=>expect(invoke).toHaveBeenCalledTimes(3));expect(onChange).not.toHaveBeenCalled();expect(screen.getByRole("table")).toHaveTextContent("Est–ovest");const ultimo=invoke.mock.calls.at(-1) as unknown as [string,{body:{gruppi:Array<{azimut:number}>}}];expect(ultimo[1].body.gruppi.map(g=>g.azimut).sort((a,b)=>a-b)).toEqual([90,270]);
 });
 it("impedisce modifiche in sola lettura",()=>{
  const onChange=vi.fn();render(<CapannoneLocale piano={piano} runtime={runtime} modificabile={false} onChange={onChange} potenzaModuloW={450} localita={null} riepilogoProposta={undefined}/>);
  for(const nome of ["Crea schema e applica posa alla bozza","Applica posa al rilievo attuale","Inserisci zona e ridisponi","Rimuovi gruppo dalla disposizione"])expect(screen.getByRole("button",{name:nome})).toBeDisabled();expect(screen.getByLabelText("Moduli capannone")).toBeDisabled();expect(onChange).not.toHaveBeenCalled();
 });
});
