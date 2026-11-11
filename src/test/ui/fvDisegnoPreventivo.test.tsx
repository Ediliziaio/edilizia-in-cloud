import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FvDisegnoPreventivo } from "@/components/fotovoltaico/FvDisegnoPreventivo";
import { aggiornaOstacoloConPosa, creaDisegnoTetto, disponiModuliAutomaticamente, pannelliDaRivedere } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { datiDalDisegno } from "@/lib/fotovoltaico/disegnoPreventivo";
const modulo={corto:1.134,lungo:1.762,stimato:false};
const piano=()=>disponiModuliAutomaticamente(creaDisegnoTetto("due_falde",12,8,modulo),16);
afterEach(cleanup);
function Monta(){const [value,setValue]=useState(piano);const patch=datiDalDisegno(value,450);return <><output aria-label="Quantità e potenza">{patch.numero_pannelli_scelti} / {patch.potenza_kwp}</output><FvDisegnoPreventivo value={value} onChange={setValue} modulo={modulo} potenzaModuloW={450} quantitaIniziale={16} modificabile /></>;}
describe("Editor commerciale FV",()=>{
  it("confronta pose e allineamenti conservando quantità e potenza coerenti",()=>{
    render(<Monta/>);
    fireEvent.click(screen.getByRole("button",{name:"Confronta pose e allineamenti"}));
    expect(screen.getByText(/Confronto pose:.*verticali.*orizzontali/)).toBeTruthy();
    expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("16 / 7.2");
  });
  it("rimuove un pannello e annulla/ripete mantenendo quantità e kWp",()=>{
    render(<Monta/>);
    fireEvent.keyDown(screen.getByRole("button",{name:"Modulo 1"}),{key:"Delete"});
    expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("15 / 6.75");
    fireEvent.click(screen.getByRole("button",{name:"Annulla ultima modifica"}));
    expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("16 / 7.2");
    fireEvent.click(screen.getByRole("button",{name:"Ripeti modifica"}));
    expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("15 / 6.75");
  });
  it("distribuisce la quantità richiesta e usa solo i moduli che entrano",()=>{
    render(<Monta/>);
    fireEvent.change(screen.getByLabelText("Moduli da disporre"),{target:{value:"500"}});
    fireEvent.click(screen.getByRole("button",{name:"Disponi automaticamente"}));
    expect(screen.getByText(/Entrano \d+ dei 500/)).toBeTruthy();
    expect(screen.getByLabelText("Quantità e potenza")).not.toHaveTextContent("500 /");
  });
  it("i comandi restano in sola lettura e il tasto cancella non modifica",()=>{
    const onChange=vi.fn();render(<FvDisegnoPreventivo value={piano()} onChange={onChange} modulo={modulo} potenzaModuloW={450} quantitaIniziale={16} modificabile={false}/>);
    expect(screen.getByRole("button",{name:"Disponi automaticamente"})).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("button",{name:"Modulo 1"}),{key:"Delete"});
    expect(onChange).not.toHaveBeenCalled();
  });
  it("scarta uno spostamento che esce dal bordo e mantiene la quantità",()=>{
    render(<Monta/>);
    fireEvent.keyDown(screen.getByRole("button",{name:"Modulo 1"}),{key:"Enter"});
    fireEvent.click(screen.getByRole("button",{name:"Sposta pannello a sinistra"}));
    expect(screen.getByText(/Posizione non disponibile/)).toBeTruthy();
    expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("16 / 7.2");
  });
});

it("le viste aggiuntive condividono bozza, sola lettura e annulla/ripeti dell’editor",()=>{
  function MontaViste(){
    const [value,onChange]=useState(piano),patch=datiDalDisegno(value,450);
    return <><output aria-label="Moduli della bozza">{patch.numero_pannelli_scelti}</output><FvDisegnoPreventivo value={value} onChange={onChange} modulo={modulo} potenzaModuloW={450} quantitaIniziale={16} modificabile contorniBloccati vistaIniziale="foto" visteAggiuntive={[{id:"foto",nome:"Foto sul tetto",contenuto:salva=><button onClick={()=>{const p=value.pannelli[0];const next=aggiornaOstacoloConPosa(value,{id:"camino",x:p.x,y:p.y,w:1,h:1});if(next)salva(next);}}>Segna ingombro di prova</button>} ]}/></>;
  }
  render(<MontaViste/>);
  expect(screen.getByRole("button",{name:"Tetto e misure"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Segna ingombro di prova"}));
  expect(screen.getByRole("button",{name:"Annulla ultima modifica"})).not.toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Pianta delle falde"}));
  expect(screen.getAllByRole("button",{name:/^Ostacolo /})).toHaveLength(1);
  fireEvent.keyDown(screen.getByRole("button",{name:"Ostacolo camino"}),{key:"Enter"});
  expect(screen.getByLabelText("Ostacolo w")).toHaveValue(1);
  fireEvent.change(screen.getByLabelText("Ostacolo w"),{target:{value:"1.5"}});
  expect(screen.getByLabelText("Ostacolo w")).toHaveValue(1.5);
  fireEvent.click(screen.getByRole("button",{name:"Annulla ultima modifica"}));
  expect(screen.queryByLabelText("Ostacolo w")).toBeNull();
  fireEvent.keyDown(screen.getByRole("button",{name:"Ostacolo camino"}),{key:"Enter"});
  expect(screen.getByLabelText("Ostacolo w")).toHaveValue(1);
  fireEvent.click(screen.getByRole("button",{name:"Annulla ultima modifica"}));
  expect(screen.queryByRole("button",{name:"Ostacolo camino"})).toBeNull();
  expect(screen.getByLabelText("Moduli della bozza")).toHaveTextContent("16");
});

it("rifiuta misure di ostacoli fuori falda e mantiene una posa valida",()=>{
  function MontaOstacolo(){
    const [value,setValue]=useState(()=>aggiornaOstacoloConPosa(piano(),{id:"camino",x:.4,y:.4,w:1,h:1})!);
    return <><output aria-label="Moduli invalidi">{pannelliDaRivedere(value).length}</output><FvDisegnoPreventivo value={value} onChange={setValue} modulo={modulo} potenzaModuloW={450} quantitaIniziale={16} modificabile/></>;
  }
  render(<MontaOstacolo/>);
  fireEvent.keyDown(screen.getByRole("button",{name:"Ostacolo camino"}),{key:"Enter"});
  fireEvent.change(screen.getByLabelText("Ostacolo w"),{target:{value:"20"}});
  expect(screen.getByLabelText("Ostacolo w")).toHaveValue(1);
  expect(screen.getByLabelText("Moduli invalidi")).toHaveTextContent("0");
  expect(screen.getByText(/deve restare nella falda/)).toBeTruthy();
});

it("ridisegna il contorno della falda senza duplicarla né perdere i moduli",()=>{
  vi.stubGlobal("PointerEvent", MouseEvent);
  try {
    const {container}=render(<Monta/>);
    fireEvent.click(screen.getByRole("button",{name:"Disegna una falda"}));
    fireEvent.change(screen.getByLabelText("Falda da disegnare"),{target:{value:"falda-1"}});
    const svg=container.querySelector(".fv-roof-canvas>svg")!;
    Object.defineProperty(svg,"getBoundingClientRect",{value:()=>({left:0,top:0,width:720,height:520})});
    for(const [x,y] of [[0,0],[10,0],[10,3.5],[0,3.5]]) fireEvent.pointerDown(svg,{clientX:(x+1.2)*50,clientY:(y+1.2)*50});
    fireEvent.click(screen.getByRole("button",{name:"Chiudi falda"}));
    expect(container.querySelectorAll(".fv-roof-canvas polygon")).toHaveLength(2);
    expect(container.querySelector(".fv-roof-canvas polygon")).toHaveAttribute("points","0,0 10,0 10,3.5 0,3.5");
    expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("16 / 7.2");
    expect(screen.getByRole("alert")).toHaveTextContent("moduli da riposizionare");
  } finally {vi.unstubAllGlobals();}
});


it("annulla anche misure e forma del tetto",()=>{
  render(<Monta/>);fireEvent.click(screen.getByRole("button",{name:"Tetto e misure"}));
  fireEvent.change(screen.getByLabelText("Larghezza del tetto"),{target:{value:"6"}});
  fireEvent.click(screen.getByRole("button",{name:"Applica misure e ridisponi"}));
  expect(screen.getByLabelText("Larghezza del tetto")).toHaveValue(6);
  fireEvent.click(screen.getByRole("button",{name:"Annulla ultima modifica"}));
  expect(screen.getByLabelText("Larghezza del tetto")).toHaveValue(12);
  expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("16 / 7.2");
});
it("ridisporre una sola falda conserva i pannelli dell’altra",()=>{
  render(<Monta/>);
  fireEvent.change(screen.getByLabelText("Falde da riempire"),{target:{value:"falda-1"}});
  fireEvent.change(screen.getByLabelText("Moduli da disporre"),{target:{value:"2"}});
  fireEvent.click(screen.getByRole("button",{name:"Disponi automaticamente"}));
  expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("9 / 4.05");
  expect(screen.getByText(/altre falde conservate/)).toBeTruthy();
});

it("trascina un pannello su un’altra falda libera senza cambiare quantità e potenza",()=>{
  vi.stubGlobal("PointerEvent",MouseEvent);
  try {
    const {container}=render(<Monta/>);
    const svg=container.querySelector(".fv-roof-canvas>svg")!;
    Object.defineProperty(svg,"getBoundingClientRect",{value:()=>({left:0,top:0,width:720,height:520})});
    fireEvent.pointerDown(screen.getByRole("button",{name:"Modulo 1"}),{clientX:100,clientY:115});
    fireEvent.pointerMove(svg,{clientX:605,clientY:315});fireEvent.pointerUp(svg);
    const rect=screen.getByRole("button",{name:"Modulo 1"}).querySelectorAll("rect")[1];
    expect(rect).toHaveAttribute("x","10.4");expect(rect).toHaveAttribute("y","4.3");
    expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("16 / 7.2");
  } finally {vi.unstubAllGlobals();}
});

it("mostra i moduli full black appoggiati al tetto senza modificare la configurazione",()=>{
  const {container}=render(<Monta/>);
  fireEvent.click(screen.getByRole("button",{name:"Vista della casa"}));
  expect(screen.getByRole("img",{name:"Vista illustrativa della casa con pannelli sul tetto"})).toBeTruthy();
  expect(container.querySelectorAll('polygon[fill="url(#fv-render-black)"]')).toHaveLength(16);
  fireEvent.click(screen.getByRole("button",{name:"Ruota vista"}));
  fireEvent.change(screen.getByLabelText("Copertura della vista illustrativa"),{target:{value:"tegole"}});
  expect(screen.getByLabelText("Quantità e potenza")).toHaveTextContent("16 / 7.2");
  fireEvent.click(screen.getByRole("button",{name:"Pianta e posa"}));
  expect(screen.getAllByRole("button",{name:/^Modulo \d+$/})).toHaveLength(16);
});

it("conserva gli ostacoli quando cambia lo schema del tetto",()=>{
  vi.stubGlobal("PointerEvent",MouseEvent);
  try {
    const {container}=render(<Monta/>),svg=container.querySelector(".fv-roof-canvas>svg")!;
    Object.defineProperty(svg,"getBoundingClientRect",{value:()=>({left:0,top:0,width:720,height:520})});
    fireEvent.click(screen.getByRole("button",{name:"Aggiungi ostacolo"}));
    fireEvent.pointerDown(svg,{clientX:75,clientY:185});
    expect(screen.getAllByRole("button",{name:/^Ostacolo /})).toHaveLength(1);
    fireEvent.click(screen.getByRole("button",{name:"Tetto e misure"}));
    fireEvent.change(screen.getByLabelText("Larghezza del tetto"),{target:{value:"6"}});
    fireEvent.click(screen.getByRole("button",{name:"Applica misure e ridisponi"}));
    expect(screen.getAllByRole("button",{name:/^Ostacolo /})).toHaveLength(1);
  } finally {vi.unstubAllGlobals();}
});
