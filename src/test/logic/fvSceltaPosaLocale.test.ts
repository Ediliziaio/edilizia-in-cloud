import {describe,it,expect} from "vitest";
import {propostePosa,bloccoRegolare,firmaPosa} from "../../../dev/fotovoltaico-locale/propostePosa";
import {posaCasaReale,edificioCasaReale,riepilogoPosaCasaReale,datiCasaTettoReale,documentoCasaTettoReale} from "../../../dev/fotovoltaico-locale/casaTettoReale";
import {applicaAreaPosa,facceConAreePosa} from "../../../dev/fotovoltaico-locale/areaPosa";
import {pannelliDaRivedere,rettangoloNellaFalda,ingombroModulo,disponiModuliOttimizzati} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {dallaFotoAlDisegno,uvOrtofoto,sagomeOstacoliEdificio} from "../../../dev/fotovoltaico-locale/tettoReale";
const modulo={corto:1.134,lungo:1.762,stimato:false};
const vertice=(x:number,y:number)=>dallaFotoAlDisegno(edificioCasaReale,"faccia-22",{x:x/20-20,y:20-y/20});
const perimetro=[[474,366],[542,369],[393,495],[371,463]].map(([x,y])=>vertice(x,y));
describe("confronto pose sulla falda",()=>{
 it("produce alternative geometriche valide e non modifica la bozza durante il confronto",()=>{
  const prima=JSON.stringify(posaCasaReale),ps=propostePosa(posaCasaReale,"faccia-22",5);
  expect(ps.map(p=>p.id)).toEqual(["verticale","orizzontale","compatta"]);
  expect(ps.map(p=>p.moduliFalda)).toEqual([5,5,4]);expect(JSON.stringify(posaCasaReale)).toBe(prima);
  for(const p of ps){expect(pannelliDaRivedere(p.piano)).toEqual([]);expect(p.piano.ostacoli).toEqual(posaCasaReale.ostacoli);expect(p.piano.falde).toEqual(posaCasaReale.falde);}
  expect(firmaPosa(ps[0].piano)).not.toBe(firmaPosa(ps[1].piano));
 });
 it("non inventa rese diverse per la rotazione del modulo sullo stesso piano",()=>{
  const ps=propostePosa(posaCasaReale,"faccia-22",5);
  const a=riepilogoPosaCasaReale(ps[0].piano),b=riepilogoPosaCasaReale(ps[1].piano),c=riepilogoPosaCasaReale(ps[2].piano);
  expect(a.produzione).toBe(b.produzione);expect(a.prezzo).toBe(b.prezzo);expect(c.kwp).toBe(1.8);expect(c.prezzo).toBe(4612);
  expect(datiCasaTettoReale(ps[2].piano).componenti.find(c=>c.categoria==="pannello")!.quantita).toBe(4);
  expect(documentoCasaTettoReale("foto",undefined,ps[2].piano).html).toContain("4 pannelli");
 });
 it("conserva le altre falde e rifiuta target errati o una falda inesistente",()=>{
  const altra=disponiModuliOttimizzati(posaCasaReale,1,false,"faccia-25"),conservati=altra.pannelli.filter(m=>m.faldaId!=="faccia-22");
  for(const p of propostePosa(altra,"faccia-22",5))expect(p.piano.pannelli.filter(m=>m.faldaId!=="faccia-22")).toEqual(conservati);
  for(const n of [0,-1,2.5,501,NaN])expect(propostePosa(posaCasaReale,"faccia-22",n)).toEqual([]);
  expect(propostePosa(posaCasaReale,"assente",5)).toEqual([]);
 });
 it("il blocco compatto non salta una fila o colonna vuota",()=>{
  const pannelli=[{id:"a",faldaId:"f",x:0,y:0,orizzontale:false},{id:"b",faldaId:"f",x:5,y:0,orizzontale:false},{id:"c",faldaId:"f",x:0,y:8,orizzontale:false}];
  expect(bloccoRegolare(pannelli,modulo,.05)).toHaveLength(1);
 });
});
describe("perimetro tracciato a punti sulla foto",()=>{
 it("ricalcola entro il nuovo poligono e lascia intatti gli ostacoli e il modello sorgente",()=>{
  const prima=JSON.stringify(posaCasaReale),edPrima=JSON.stringify(edificioCasaReale),r=applicaAreaPosa(posaCasaReale,"faccia-22",perimetro);
  expect(r.prima).toBe(5);expect(r.dopo).toBe(3);expect(r.areaMq).toBeCloseTo(28.619,2);
  expect(pannelliDaRivedere(r.piano)).toEqual([]);expect(r.piano.ostacoli).toEqual(posaCasaReale.ostacoli);expect(sagomeOstacoliEdificio(edificioCasaReale,r.piano)).toHaveLength(1);
  for(const m of r.piano.pannelli)expect(rettangoloNellaFalda(ingombroModulo(m,r.piano.modulo),r.piano.falde.find(f=>f.id===m.faldaId)!,r.piano.distanzaBordo)).toBe(true);
  expect(JSON.stringify(posaCasaReale)).toBe(prima);expect(JSON.stringify(edificioCasaReale)).toBe(edPrima);
 });
 it("foto e 3D riproiettano gli stessi vertici scelti senza alterare la quota del piano",()=>{
  const r=applicaAreaPosa(posaCasaReale,"faccia-22",perimetro),f=facceConAreePosa(edificioCasaReale,r.piano).find(f=>f.id==="faccia-22")!;
  const pp=f.anelli[0].map(p=>{const q=uvOrtofoto(edificioCasaReale,p);return[q.u*800,(1-q.v)*800];});
  [[474,366],[542,369],[393,495],[371,463]].forEach((p,i)=>{expect(pp[i][0]).toBeCloseTo(p[0],5);expect(pp[i][1]).toBeCloseTo(p[1],5);});
  const d=datiCasaTettoReale(r.piano);expect(d.progetto.qualita_dati_tetto).toContain("corretta sulla foto");
  expect(documentoCasaTettoReale("foto",undefined,r.piano).html).toContain("tracciata manualmente sulla foto");
 });
 it("blocca contorni incrociati, troppo piccoli o incompleti",()=>{
  for(const punti of [perimetro.slice(0,2),[perimetro[0],perimetro[2],perimetro[1],perimetro[3]],[{x:1,y:1},{x:1.01,y:1},{x:1,y:1.01}]])expect(()=>applicaAreaPosa(posaCasaReale,"faccia-22",punti)).toThrow();
 });
});
