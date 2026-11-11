import { describe, expect, it } from "vitest";
import { creaDisegnoTetto, disponiModuliAutomaticamente, leggiDisegnoCommerciale, pannelliDaRivedere, poligonoValido, posizioneModuloValida, svgDisegnoCommerciale } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { cambiaModalitaProgettazione } from "../../../supabase/functions/_shared/fvModalitaProgettazione";
import { datiDalDisegno } from "@/lib/fotovoltaico/disegnoPreventivo";
import { righeComponentiFv } from "@/lib/fotovoltaico/componentiConfigurazione";
import { calcolaPrezzoFv } from "@/lib/fotovoltaico/prezzoPreventivo";
import { problemiConfigurazioneFv } from "@/lib/fotovoltaico/configurazioneValidation";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import { loadPersistedDraft, savePersistedDraft } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/helpers";
const tetto = () => creaDisegnoTetto("due_falde", 12, 8, { corto: 1.134, lungo: 1.762, stimato: false });
describe("Disegno commerciale FV", () => {
  it.each(["due_falde", "singola", "elle"] as const)("dispone solo moduli validi sul tetto %s", tipo => {
    const p = disponiModuliAutomaticamente(creaDisegnoTetto(tipo), 80);
    expect(p.pannelli.length).toBeGreaterThan(10);
    expect(p.pannelli.length).toBeLessThan(80);
    expect(pannelliDaRivedere(p)).toEqual([]);
    expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("riempie entrambe le falde senza perdere colonne per arrotondamenti", () => {
    const p = disponiModuliAutomaticamente(tetto(), 16);
    expect(p.pannelli).toHaveLength(16);
    expect(new Set(p.pannelli.map(m => m.faldaId)).size).toBe(2);
    expect(pannelliDaRivedere(p)).toEqual([]);
  });
  it("rispetta bordo, ostacoli e sovrapposizioni anche tra falde", () => {
    const p = disponiModuliAutomaticamente(tetto(), 16), m = p.pannelli[0];
    expect(posizioneModuloValida(p, { ...m, x: 0 })).toBe(false);
    expect(posizioneModuloValida(p, { ...m, x: p.pannelli[1].x })).toBe(false);
    expect(posizioneModuloValida({ ...p, ostacoli: [{ id: "camino", x: m.x, y: m.y, w: 1, h: 1 }] }, m)).toBe(false);
    const conOstacolo = disponiModuliAutomaticamente({ ...tetto(), ostacoli: [{ id: "camino", x: .3, y: .3, w: 1, h: 1 }] }, 16);
    expect(pannelliDaRivedere(conOstacolo)).toEqual([]);
    expect(conOstacolo.pannelli[0].x).toBeGreaterThan(.3);
  });
  it("non accetta un modulo che attraversa una rientranza concava pur avendo i quattro vertici dentro", () => {
    const p = creaDisegnoTetto("singola", 4, 4, { corto: 1, lungo: 2, stimato: false });
    p.distanzaBordo = 0;
    p.falde[0].punti = [{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:2.6,y:4},{x:2,y:1},{x:1.4,y:4},{x:0,y:4}];
    expect(poligonoValido(p.falde[0].punti)).toBe(true);
    expect(posizioneModuloValida(p, { id:"m",faldaId:"falda-1",x:1,y:2,orizzontale:true })).toBe(false);
  });
  it("ruota i moduli e riempie solo la falda richiesta", () => {
    const p = disponiModuliAutomaticamente(tetto(), 10, true, "falda-2");
    expect(p.pannelli).toHaveLength(10);
    expect(p.pannelli.every(m => m.orizzontale && m.faldaId === "falda-2")).toBe(true);
    expect(pannelliDaRivedere(p)).toEqual([]);
  });
  it("limita a 500 moduli ed emette sempre ID univoci", () => {
    const p = disponiModuliAutomaticamente(creaDisegnoTetto("singola", 100, 100), 9999);
    expect(p.pannelli).toHaveLength(500);
    expect(new Set(p.pannelli.map(m => m.id)).size).toBe(500);
  });
  it("rifiuta JSON malformato, riferimenti rotti e poligoni incrociati", () => {
    const p = disponiModuliAutomaticamente(tetto(), 2);
    for (const raw of [null, {...p, versione:2}, {...p, pannelli:[p.pannelli[0],p.pannelli[0]]}, {...p, pannelli:[{...p.pannelli[0],faldaId:"assente"}]}, {...p, modulo:{corto:0,lungo:2}}, {...p, falde:[{...p.falde[0],punti:[{x:0,y:0},{x:4,y:4},{x:4,y:0},{x:0,y:4}]}]}]) expect(leggiDisegnoCommerciale(raw)).toBeNull();
  });
  it("mantiene quantità e avvisa dopo una modifica delle misure del modulo", () => {
    const p = disponiModuliAutomaticamente(tetto(), 16);
    const cambiato = {...p, modulo:{...p.modulo,corto:1.6,lungo:2.5}};
    expect(pannelliDaRivedere(cambiato).length).toBeGreaterThan(0);
    expect(leggiDisegnoCommerciale(cambiato)?.pannelli).toHaveLength(16);
  });
  it("ripristina il disegno dalla bozza e dopo il passaggio senza mappa", () => {
    const p = disponiModuliAutomaticamente(tetto(), 16);
    for (const layout of [p, cambiaModalitaProgettazione(p,true)]) {
      savePersistedDraft("disegno-fv", {data:{...INITIAL,layout_overlay:layout},step:5,completedSteps:[1,2,3,4]},"u:c");
      const letto = loadPersistedDraft("disegno-fv","u:c")!.data.layout_overlay;
      expect(cambiaModalitaProgettazione(letto,false)).toEqual(p);
    }
  });
  it("quantità reali e potenza alimentano gli stessi prezzi del preventivatore", () => {
    const p = disponiModuliAutomaticamente(tetto(), 16);
    const d = {...INITIAL,con_accumulo:false,pannello_id:"p",inverter_id:"i",...datiDalDisegno(p,450)};
    const listino={pannelli:[{id:"p",descrizione:"Modulo",potenza_w:450,prezzo_acquisto:120,prezzo_vendita:180}],inverter:[{id:"i",prezzo_vendita:1500,prezzo_acquisto:1000}],accumuli:[] as never[]};
    const calcola=(data:typeof d)=>calcolaPrezzoFv({componenti:righeComponentiFv(data,listino),manodopera:[],servizi:[],prezzoManuale:null,sconto:{tipo:"pct",valore:0},scontoMaxPct:100,margineMinPct:0,ivaAliquota:.1});
    expect(d.potenza_kwp).toBe(7.2);
    expect(righeComponentiFv(d,listino)[0].quantita).toBe(16);
    const ridotto={...d,...datiDalDisegno({...p,pannelli:p.pannelli.slice(0,-1)},450)};
    expect(ridotto.potenza_kwp).toBe(6.75);
    expect(calcola(d).totale-calcola(ridotto).totale).toBeCloseTo(198);
    expect(problemiConfigurazioneFv({...d,numero_pannelli_scelti:12},listino)).toContain("La quantità del preventivo deve corrispondere ai pannelli disegnati.");
    expect(()=>datiDalDisegno(p,NaN)).toThrow();
  });
  it("esporta solo SVG sicuro, con evidenza degli elementi da rivedere", () => {
    const p = disponiModuliAutomaticamente(tetto(),2); p.falde[0].nome='<script>alert(1)</script>';
    p.pannelli[0].x=-1;
    const svg=svgDisegnoCommerciale(p);
    expect(svg).toContain('&lt;script&gt;'); expect(svg).not.toContain('<script>'); expect(svg).toContain('#DC2626');
  });
});

it("ridispone e svuota una sola falda conservando gli altri moduli e ID univoci",()=>{
  const iniziale=disponiModuliAutomaticamente(creaDisegnoTetto("due_falde",12,8,{corto:1.134,lungo:1.762,stimato:false}),16);
  const altri=iniziale.pannelli.filter(p=>p.faldaId==="falda-2");
  const ridotto=disponiModuliAutomaticamente(iniziale,2,false,"falda-1");
  expect(ridotto.pannelli.filter(p=>p.faldaId==="falda-2")).toEqual(altri);
  expect(ridotto.pannelli).toHaveLength(altri.length+2);
  expect(new Set(ridotto.pannelli.map(p=>p.id)).size).toBe(ridotto.pannelli.length);
  expect(pannelliDaRivedere(ridotto)).toEqual([]);
  expect(disponiModuliAutomaticamente(ridotto,0,false,"falda-1").pannelli).toEqual(altri);
});

it("non salva un disegno con pannelli fuori falda",()=>{
  const p=disponiModuliAutomaticamente(creaDisegnoTetto("singola"),2);p.pannelli[0].x=-2;
  const d={...INITIAL,pannello_id:"p",inverter_id:"i",con_accumulo:false,...datiDalDisegno(p,450)};
  expect(problemiConfigurazioneFv(d)).toContain("Riposiziona i pannelli fuori falda o sovrapposti prima di salvare la configurazione.");
});

const simulazioni = (["due_falde","singola","elle"] as const).flatMap(tipo=>[false,true].flatMap(orientamento=>[[4,4],[8,6],[14,10]].flatMap(([larghezza,altezza])=>[450,500].map(watt=>({tipo,orientamento,larghezza,altezza,watt})))));
it.each(simulazioni)("simulazione $tipo $larghezza × $altezza, $watt W, orizzontale=$orientamento",({tipo,orientamento,larghezza,altezza,watt})=>{
  const p=disponiModuliAutomaticamente(creaDisegnoTetto(tipo,larghezza,altezza,{corto:1.134,lungo:watt===450?1.762:1.962,stimato:false}),16,orientamento);
  const d={...INITIAL,con_accumulo:false,pannello_id:"p",inverter_id:"i",...datiDalDisegno(p,watt)};
  const listino={pannelli:[{id:"p",potenza_w:watt,prezzo_vendita:180,prezzo_acquisto:120}],inverter:[{id:"i",prezzo_vendita:1500,prezzo_acquisto:1000}],accumuli:[] as never[]};
  expect(p.pannelli.length).toBeLessThanOrEqual(16);
  expect(pannelliDaRivedere(p)).toEqual([]);
  expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(p)))).toEqual(p);
  const righe=righeComponentiFv(d,listino);
  expect(righe[0].quantita).toBe(p.pannelli.length);
  expect(d.potenza_kwp).toBe(p.pannelli.length*watt/1000);
  const prezzo=calcolaPrezzoFv({componenti:righe,manodopera:[],servizi:[],prezzoManuale:null,sconto:{tipo:"pct",valore:0},scontoMaxPct:10,margineMinPct:0,ivaAliquota:.1});
  expect(prezzo.totale).toBeCloseTo((p.pannelli.length*180+1500)*1.1,2);
});
