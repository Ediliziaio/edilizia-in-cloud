import {describe,expect,it} from "vitest";
import {aggiornaOstacoloConPosa,creaDisegnoTetto,disponiModuliAutomaticamente,disponiModuliOttimizzati,pannelliDaRivedere,leggiDisegnoCommerciale} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {creaPianoReale,dalDisegnoAlMondo,dallaFotoAlDisegno,leggiEdificio3d,pannelliDalDisegnoReale,uvOrtofoto,FOTO_BBOX} from "../../../dev/fotovoltaico-locale/tettoReale";
import raw from "../../../dev/fotovoltaico-locale/esempi/edificio-3dbag-originale.json";
const edificio=leggiEdificio3d(raw),modulo={corto:1.134,lungo:1.762,stimato:false};
describe("Posa commerciale con ostacoli e più griglie",()=>{
 it.each(["singola","due_falde","elle"] as const)("confronta pose su %s senza peggiorare la griglia originale",tipo=>{
  const p=creaDisegnoTetto(tipo,12,8,modulo),prima=structuredClone(p);
  for(const orient of [false,true,"auto"] as const){
   const next=disponiModuliOttimizzati(p,100,orient);
   const base=disponiModuliAutomaticamente(p,100,orient===true);
   expect(next.pannelli.length).toBeGreaterThanOrEqual(base.pannelli.length);
   expect(pannelliDaRivedere(next)).toEqual([]);expect(leggiDisegnoCommerciale(next)).toEqual(next);
  }
  expect(p).toEqual(prima);
 });
 it("inserisce un ostacolo sotto pannelli già posati e ricalcola solo la falda coinvolta",()=>{
  const p=disponiModuliAutomaticamente(creaDisegnoTetto("due_falde",12,8,modulo),16),m=p.pannelli[0],altri=p.pannelli.filter(v=>v.faldaId!==m.faldaId);
  const next=aggiornaOstacoloConPosa(p,{id:"camino",x:m.x,y:m.y,w:1,h:1})!;
  expect(next.ostacoli).toHaveLength(1);expect(pannelliDaRivedere(next)).toEqual([]);
  expect(next.pannelli.filter(v=>v.faldaId!==m.faldaId)).toEqual(altri);
  expect(new Set(next.pannelli.map(m=>m.id)).size).toBe(next.pannelli.length);
  expect(aggiornaOstacoloConPosa(next,{...next.ostacoli[0],x:-10})).toBeNull();
  expect(next.ostacoli[0].x).toBe(m.x);
 });
 it("rispetta spazio tra moduli, limite e richiesta nulla su un tetto grande",()=>{
  const p=creaDisegnoTetto("singola",100,100,modulo),next=disponiModuliOttimizzati(p,99999);
  expect(next.pannelli).toHaveLength(500);expect(pannelliDaRivedere(next)).toEqual([]);
  expect(disponiModuliOttimizzati(next,0).pannelli).toEqual([]);
  expect(disponiModuliOttimizzati(next,NaN).pannelli).toEqual([]);
 });
 it("migliora la proposta sulle falde reali senza alterare il rilievo",()=>{
  const piano=creaPianoReale(edificio,modulo),prima=structuredClone(piano);
  for(const f of piano.falde){
   const old=disponiModuliAutomaticamente(piano,100,false,f.id),next=disponiModuliOttimizzati(piano,100,"auto",f.id);
   expect(next.pannelli.length).toBeGreaterThanOrEqual(old.pannelli.length);
   expect(pannelliDaRivedere(next)).toEqual([]);
   for(const m of pannelliDalDisegnoReale(edificio,next)){
    expect(Math.hypot(m.vertici[1].x-m.vertici[0].x,m.vertici[1].y-m.vertici[0].y,m.vertici[1].z-m.vertici[0].z)).toBeCloseTo(m.larghezza,6);
   }
   for(const p of f.punti){const mondo=dalDisegnoAlMondo(edificio,f.id,p),ritorno=dallaFotoAlDisegno(edificio,f.id,mondo);expect(ritorno.x).toBeCloseTo(p.x,6);expect(ritorno.y).toBeCloseTo(p.y,6);}
  }
  expect(piano).toEqual(prima);
 });
 it("usa lo stesso riferimento geografico per la foto e le UV del 3D",()=>{
  const sw=uvOrtofoto(edificio,{x:FOTO_BBOX.minX-edificio.origine.x,y:FOTO_BBOX.minY-edificio.origine.y,z:0});
  const ne=uvOrtofoto(edificio,{x:FOTO_BBOX.maxX-edificio.origine.x,y:FOTO_BBOX.maxY-edificio.origine.y,z:0});
  expect(sw).toEqual({u:0,v:0});expect(ne).toEqual({u:1,v:1});
 });
});
