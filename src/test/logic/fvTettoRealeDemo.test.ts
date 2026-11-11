import {describe,expect,it} from "vitest";
import raw from "../../../dev/fotovoltaico-locale/esempi/edificio-3dbag-originale.json";
import {leggiEdificio3d,pianoDellaFaccia,disponiSuFaldaReale,triangoliFaccia,dot,sub} from "../../../dev/fotovoltaico-locale/tettoReale";
import {puntoNelPoligono} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
const edificio=leggiEdificio3d(raw),falde=edificio.facce.filter(f=>f.tipo==="RoofSurface");
describe("Simulazione da tetto reale 3DBAG",()=>{
 it("legge geometria e quote dal dataset originale, senza sostituirle con un tetto convenzionale",()=>{
  expect(edificio.id).toBe("NL.IMBAG.Pand.0503100000022863");expect(falde).toHaveLength(4);
  expect(edificio.attributi.b3_opp_grond).toBe(71.52);
  const quote = edificio.facce.flatMap(f=>f.anelli.flatMap(r=>r.map(p=>p.z)));
  expect(Math.max(...quote)).toBeGreaterThan(12);
  expect(falde.every(f=>f.pendenza!==null&&f.azimut!==null)).toBe(true);
 });
 it.each(edificio.facce.map(f=>[f.id,f] as const))("triangola la superficie reale %s senza perdere vertici finiti",(_id,f)=>{
  const t=triangoliFaccia(f);expect(t.length).toBeGreaterThanOrEqual(3);expect(t.length%3).toBe(0);
  expect(t.every(p=>[p.x,p.y,p.z].every(Number.isFinite))).toBe(true);
 });
 it.each(falde.map(f=>[f.id,f] as const))("i pannelli sulla falda %s rispettano piano, dimensioni e contorno",(_id,f)=>{
  const piano=pianoDellaFaccia(f);
  expect(Math.max(...f.anelli[0].map(p=>Math.abs(dot(sub(p,piano.origine),piano.n))))).toBeLessThan(.03);
  for(const orient of [false,true]){
   const pannelli=disponiSuFaldaReale(f,100,orient);expect(pannelli.length).toBeLessThanOrEqual(100);
   for(const p of pannelli){
    expect(Math.hypot(...Object.values(sub(p.vertici[1],p.vertici[0])))).toBeCloseTo(p.larghezza,6);
    expect(Math.hypot(...Object.values(sub(p.vertici[2],p.vertici[1])))).toBeCloseTo(p.lunghezza,6);
    for(const v of p.vertici){const d=sub(v,piano.origine);expect(dot(d,piano.n)).toBeCloseTo(.055,6);expect(puntoNelPoligono({x:dot(d,piano.u),y:dot(d,piano.v)},piano.contorno)).toBe(true);}
   }
  }
 });
 it("permette un esempio di posa ma non presenta le pareti come superfici installabili",()=>{
  expect(falde.some(f=>disponiSuFaldaReale(f,12).length>0)).toBe(true);
  expect(disponiSuFaldaReale(edificio.facce.find(f=>f.tipo==="WallSurface")!,12)).toEqual([]);
 });
 it.each(falde.map(f=>[f.id,f] as const))("la posa sulla falda %s non dipende dal primo vertice del file",(_id,f)=>{
  const ruotata={...f,anelli:f.anelli.map(r=>[...r.slice(2),...r.slice(0,2)])};
  expect(disponiSuFaldaReale(ruotata,100).length).toBe(disponiSuFaldaReale(f,100).length);
 });
});
