import {useState} from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it} from "vitest";
import {StatoPipelineIniziale} from "@/components/orders/StatoPipelineIniziale";
import type {PipelineLocale} from "@/lib/orders/pipelineLocali";
import type {SceltaPipelineCreazione} from "@/lib/orders/pipelineCreazione";
const principali=[{id:"principale-firmato",name:"Contratto firmato",color:"#123456"},{id:"principale-finito",name:"Lavori conclusi",color:"#123456"}];
const pipeline:PipelineLocale[]=[{id:"serramenti",nome:"Serramenti",fasi:[{id:"s-rilievo",name:"Rilievo definitivo",color:"#123456"},{id:"s-posa",name:"Posa programmata",color:"#123456"}]},{id:"tetti",nome:"Tetti",fasi:[{id:"t-ponteggio",name:"Ponteggio da preparare",color:"#123456"}]}];
afterEach(cleanup);
function Prova({initial={pipelineId:"principale",faseId:"principale-firmato"},items=pipeline,principale=true}:{initial?:SceltaPipelineCreazione;items?:PipelineLocale[];principale?:boolean}){const[value,setValue]=useState(initial);return <><StatoPipelineIniziale pipeline={items} statiPrincipali={principali} value={value} onChange={setValue} principale={principale}/><output aria-label="Scelta salvata">{JSON.stringify(value)}</output></>;}
function scegli(label:string,option:string){fireEvent.keyDown(screen.getByRole("combobox",{name:label}),{key:"ArrowDown"});fireEvent.click(screen.getByRole("option",{name:option}));}
describe("tipologia e stato iniziale della nuova commessa",()=>{
 it("selezionata una pipeline, mostra soltanto i suoi stati",()=>{
  render(<Prova/>);scegli("Pipeline commessa","Serramenti");
  expect(screen.getByLabelText("Scelta salvata")).toHaveTextContent('"faseId":"s-rilievo"');
  fireEvent.keyDown(screen.getByRole("combobox",{name:"Stato iniziale"}),{key:"ArrowDown"});
  expect(screen.getByRole("option",{name:"Posa programmata"})).toBeInTheDocument();expect(screen.queryByRole("option",{name:"Contratto firmato"})).toBeNull();
  fireEvent.click(screen.getByRole("option",{name:"Posa programmata"}));
  expect(screen.getByLabelText("Scelta salvata")).toHaveTextContent('"faseId":"s-posa"');
 });
 it("cambiando tipologia non mantiene uno stato appartenente alla precedente",()=>{
  render(<Prova initial={{pipelineId:"serramenti",faseId:"s-posa"}}/>);scegli("Pipeline commessa","Tetti");
  expect(screen.getByLabelText("Scelta salvata")).toHaveTextContent('"faseId":"t-ponteggio"');
 });
 it("riapre la scelta della bozza senza sostituirla con lo stato principale",()=>{
  render(<Prova initial={{pipelineId:"serramenti",faseId:"s-posa"}}/>);
  expect(screen.getByRole("combobox",{name:"Pipeline commessa"})).toHaveTextContent("Serramenti");expect(screen.getByRole("combobox",{name:"Stato iniziale"})).toHaveTextContent("Posa programmata");
 });
 it("mostra la pipeline di riferimento anche quando esiste solo Principale",()=>{
  render(<Prova items={[]}/>);expect(screen.getByRole("combobox",{name:"Pipeline commessa"})).toHaveTextContent("Principale");expect(screen.getByRole("combobox",{name:"Stato iniziale"})).toHaveTextContent("Contratto firmato");
 });
 it("richiede una tipologia operativa se la pipeline principale è nascosta",()=>{
  render(<Prova principale={false}/>);
  expect(screen.getByRole("combobox",{name:"Stato iniziale"})).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("combobox",{name:"Pipeline commessa"}),{key:"ArrowDown"});
  expect(screen.queryByRole("option",{name:"Principale"})).toBeNull();
  fireEvent.click(screen.getByRole("option",{name:"Serramenti"}));
  expect(screen.getByRole("combobox",{name:"Stato iniziale"})).toHaveTextContent("Rilievo definitivo");
 });
 it("spiega che mancano gli stati quando la scelta è disabilitata",()=>{
  render(<StatoPipelineIniziale pipeline={[]} statiPrincipali={[]} value={{pipelineId:"principale",faseId:"vecchio"}} onChange={()=>{}}/>);
  expect(screen.getByRole("combobox",{name:"Stato iniziale"})).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("Questa pipeline non ha stati disponibili");
 });
 it("una pipeline eliminata non torna silenziosamente a Principale",()=>{
  render(<Prova initial={{pipelineId:"sparita",faseId:"s-rilievo"}}/>);expect(screen.getByRole("alert")).toHaveTextContent("non è più disponibile");expect(screen.getByRole("combobox",{name:"Stato iniziale"})).toBeDisabled();expect(screen.getByLabelText("Scelta salvata")).toHaveTextContent('"pipelineId":"sparita"');
 });
 it("uno stato eliminato richiede una nuova scelta nella stessa pipeline",()=>{
  render(<Prova initial={{pipelineId:"serramenti",faseId:"s-eliminato"}}/>);expect(screen.getByRole("alert")).toHaveTextContent("stato precedente");expect(screen.getByRole("combobox",{name:"Stato iniziale"})).toHaveTextContent("Seleziona stato");
 });
});
