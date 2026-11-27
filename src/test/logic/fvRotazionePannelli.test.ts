import { describe, expect, it } from "vitest";
import { creaDisegnoTetto, disponiModuliAutomaticamente, ingombroModulo, leggiDisegnoCommerciale, pannelliDaRivedere, posizioneModuloValida, svgDisegnoCommerciale, verticiModulo, type DisegnoCommercialeFv, type ModuloPosatoFv } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { geometriaTettoDocumento } from "../../../supabase/functions/_shared/fvTettoDocumento";
import { aggiornaPianoDaMappaFv, edificioDaMappaFv, pianoDaMappaFv } from "@/components/fotovoltaico/tetto/mappaGeometria";
import { cambiaModuloReale, pannelliDalDisegnoReale } from "@/components/fotovoltaico/tetto/tettoReale";
import { rettangoloRuotatoFv, type MappaFv } from "../../../supabase/functions/_shared/fvMappa";

const modulo = {corto:1,lungo:2,stimato:false};
const mappa = (): MappaFv => ({versione:1,origine:{lat:45,lng:9},ricerca:{indirizzo:"Tetto di collaudo",posizione:{lat:45,lng:9}},distanzaOstacoli:.3,falde:[{id:"f1",nome:"Falda cliente",punti:rettangoloRuotatoFv({x:0,y:0},20,14,25),inclinazione:30,azimut:155,inclinazioneStimata:true}]});
const pannello = (patch: Partial<ModuloPosatoFv> = {}): ModuloPosatoFv => ({id:"p1",faldaId:"falda-1",x:4,y:4,orizzontale:false,...patch});
const schema = () => creaDisegnoTetto("singola",12,12,modulo);

describe("rotazione libera dei pannelli", () => {
  it("ruota attorno al centro senza deformare i lati o spostare il modulo", () => {
    const p=pannello({rotazione:37}),vs=verticiModulo(p,modulo);
    expect(vs.reduce((s,v)=>s+v.x/4,0)).toBeCloseTo(4.5,8);
    expect(vs.reduce((s,v)=>s+v.y/4,0)).toBeCloseTo(5,8);
    expect(Math.hypot(vs[1].x-vs[0].x,vs[1].y-vs[0].y)).toBeCloseTo(1,8);
    expect(Math.hypot(vs[2].x-vs[1].x,vs[2].y-vs[1].y)).toBeCloseTo(2,8);
  });
  it("rifiuta l’angolo che invade il bordo, un ostacolo o un altro pannello senza alterare la posa", () => {
    const base=schema(),p=pannello({x:.3,y:.3});
    const piano={...base,pannelli:[p]};
    expect(cambiaModuloReale(piano,p.id,{rotazione:45})).toBeNull();
    expect(piano.pannelli[0]).toEqual(p);
    const centrale=pannello({rotazione:45});
    expect(posizioneModuloValida({...base,ostacoli:[{id:"o",x:3.6,y:4.6,w:.3,h:.3}]},centrale)).toBe(false);
    expect(posizioneModuloValida({...base,pannelli:[pannello({id:"p2",x:3.6,y:4.6})]},centrale)).toBe(false);
  });
  it("non considera occupati gli angoli vuoti del riquadro che racchiude un modulo ruotato", () => {
    const p=pannello({rotazione:45});
    expect(posizioneModuloValida({...schema(),distanzaBordo:0,ostacoli:[{id:"o",x:3.45,y:3.95,w:.12,h:.12}]},p)).toBe(true);
  });
  it("salva e riapre l’angolo, accetta i vecchi disegni e scarta numeri non validi", () => {
    const piano={...schema(),pannelli:[pannello({rotazione:37})]};
    expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(piano)))?.pannelli[0].rotazione).toBe(37);
    expect(leggiDisegnoCommerciale({...piano,pannelli:[pannello()]})).toBeTruthy();
    for(const rotazione of [NaN,Infinity,361])expect(leggiDisegnoCommerciale({...piano,pannelli:[pannello({rotazione})]})).toBeNull();
    expect(svgDisegnoCommerciale(piano)).toContain('rotate(37 4.5 5)');
  });
  it("dispone anche file ruotate conservando distacchi e pannelli delle altre falde", () => {
    const base=creaDisegnoTetto("due_falde",20,20,modulo);
    const prima=disponiModuliAutomaticamente(base,4,false,"falda-2");
    const piano=disponiModuliAutomaticamente(prima,12,true,"falda-1",27);
    expect(piano.pannelli.filter(p=>p.faldaId==="falda-1")).toHaveLength(12);
    expect(piano.pannelli.filter(p=>p.faldaId==="falda-1").every(p=>p.rotazione===27&&p.orizzontale)).toBe(true);
    expect(piano.pannelli.filter(p=>p.faldaId==="falda-2")).toEqual(prima.pannelli);
    expect(pannelliDaRivedere(piano)).toEqual([]);
  });
  it.each([17,45,135,275])("mappa, 3D e PDF condividono gli stessi vertici con rotazione %s", rotazione => {
    const m=mappa(),base=pianoDaMappaFv(m,modulo),f=base.falde[0];
    const centro={x:f.punti.reduce((s,p)=>s+p.x/f.punti.length,0),y:f.punti.reduce((s,p)=>s+p.y/f.punti.length,0)};
    const piano: DisegnoCommercialeFv={...base,pannelli:[pannello({faldaId:f.id,x:centro.x-.5,y:centro.y-1,rotazione})]};
    expect(pannelliDaRivedere(piano)).toEqual([]);
    const pdf=geometriaTettoDocumento(piano)!,reale=pannelliDalDisegnoReale(edificioDaMappaFv(m),piano);
    pdf.pannelli[0].punti.forEach((v,i)=>{expect(v.x).toBeCloseTo(reale[0].vertici[i].x,7);expect(v.y).toBeCloseTo(reale[0].vertici[i].y,7);expect(v.z).toBeCloseTo(reale[0].vertici[i].z,7);});
  });
  it("conserva pannelli ruotati e impostazioni se si aggiornano solo i margini della mappa", () => {
    const m=mappa(),base=pianoDaMappaFv(m,modulo),r=ingombroModulo(pannello(),modulo);
    const piano={...base,vistePdf:{satellite:true,pianta:true,treD:true},schema3d:{altezza:12,pendenza:30},pannelli:[{...pannello({faldaId:"f1",rotazione:27}),x:base.falde[0].punti[0].x+r.w+4,y:base.falde[0].punti[0].y+r.h+4}]};
    const next=aggiornaPianoDaMappaFv({...m,distanzaOstacoli:.5},piano);
    expect(next.pannelli).toEqual(piano.pannelli);expect(next.vistePdf).toEqual(piano.vistePdf);expect(next.schema3d).toEqual(piano.schema3d);
  });
});
