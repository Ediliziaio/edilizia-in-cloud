import {describe,expect,it} from "vitest";
import {creaDisegnoTetto,disponiModuliAutomaticamente,pannelliDaRivedere} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {cambiaModuloReale} from "../../../dev/fotovoltaico-locale/tettoReale";
import {validaFotoDrone} from "../../../dev/fotovoltaico-locale/materialeDrone";
import {datiDalDisegno} from "../../../src/lib/fotovoltaico/disegnoPreventivo";
describe("Modifica diretta del pannello e materiale drone",()=>{
 it("sposta un modulo libero senza cambiare quantità/potenza e senza mutare la bozza originale",()=>{
  const p=disponiModuliAutomaticamente(creaDisegnoTetto("singola",12,8),1),prima=structuredClone(p),m=p.pannelli[0];
  const next=cambiaModuloReale(p,m.id,{x:m.x+1,y:m.y+.25})!;
  expect(next).not.toBeNull();expect(next.pannelli[0].x).toBeCloseTo(m.x+1);expect(pannelliDaRivedere(next)).toEqual([]);expect(datiDalDisegno(next,450).potenza_kwp).toBe(.45);expect(p).toEqual(prima);
 });
 it("rifiuta uscita dal tetto, sovrapposizioni, coordinate non finite e ID sconosciuti",()=>{
  const p=disponiModuliAutomaticamente(creaDisegnoTetto("singola",12,8),2),prima=structuredClone(p),[m,altro]=p.pannelli;
  expect(cambiaModuloReale(p,m.id,{x:-100})).toBeNull();expect(cambiaModuloReale(p,m.id,{x:altro.x,y:altro.y})).toBeNull();expect(cambiaModuloReale(p,m.id,{x:NaN})).toBeNull();expect(cambiaModuloReale(p,"inesistente",{})).toBeNull();expect(p).toEqual(prima);
 });
 it("consente il passaggio a un’altra falda libera usando il suo piano metrico",()=>{
  const p=disponiModuliAutomaticamente(creaDisegnoTetto("due_falde",12,8),1),m=p.pannelli[0],next=cambiaModuloReale(p,m.id,{faldaId:"falda-2",x:1,y:4.5})!;
  expect(next.pannelli[0].faldaId).toBe("falda-2");expect(pannelliDaRivedere(next)).toEqual([]);
 });
 it("ruota solo se c’è spazio per l’ingombro completo",()=>{
  const p=disponiModuliAutomaticamente(creaDisegnoTetto("singola",12,8),1),m=p.pannelli[0],next=cambiaModuloReale(p,m.id,{orizzontale:true});expect(next?.pannelli[0].orizzontale).toBe(true);
  expect(cambiaModuloReale(p,m.id,{orizzontale:true,x:11})).toBeNull();
 });
 it("accetta solo immagini di riferimento compatibili entro il limite",()=>{
  expect(validaFotoDrone({type:"image/jpeg",size:1024})).toBeNull();expect(validaFotoDrone({type:"image/png",size:15*1024*1024})).toBeNull();expect(validaFotoDrone({type:"image/webp",size:1024})).toBeNull();
  for(const f of [{type:"image/jpeg",size:0},{type:"image/jpeg",size:16*1024*1024},{type:"image/svg+xml",size:12},{type:"image/tiff",size:1024},{type:"application/octet-stream",size:1024}])expect(validaFotoDrone(f)).not.toBeNull();
 });
});
