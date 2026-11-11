import {describe,it,expect} from "vitest";
import {schemaDalDisegno} from "../../components/fotovoltaico/tetto/schema3d";
import {pannelliDalDisegnoReale} from "../../components/fotovoltaico/tetto/tettoReale";
import {creaDisegnoTetto,disponiModuliOttimizzati,leggiDisegnoCommerciale,pannelliDaRivedere} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import {datiDalDisegno} from "../../lib/fotovoltaico/disegnoPreventivo";
describe("Schema 3D del preventivo online",()=>{
 it.each(["due_falde","singola","elle"] as const)("proietta tutti i moduli di %s senza uscire dal tetto o alterare quantità e potenza",tipo=>{
  const p=disponiModuliOttimizzati(creaDisegnoTetto(tipo,12,8),16,"auto");
  for(const pendenza of [0,20,45,75]){const input={...p,schema3d:{altezza:18,pendenza}},raw=JSON.stringify(input),{runtime,piano}=schemaDalDisegno(input);expect(pannelliDaRivedere(piano)).toEqual([]);const moduli=pannelliDalDisegnoReale(runtime.edificio,piano);expect(moduli).toHaveLength(p.pannelli.length);expect(moduli.flatMap(m=>m.vertici).every(p=>[p.x,p.y,p.z].every(Number.isFinite))).toBe(true);expect(datiDalDisegno(input,450).potenza_kwp).toBe(p.pannelli.length*.45);expect(JSON.stringify(input)).toBe(raw);}
 });
 it("riapre altezza e pendenza salvate e respinge quote non valide",()=>{const p=creaDisegnoTetto("due_falde");p.schema3d={altezza:18,pendenza:32};expect(leggiDisegnoCommerciale(JSON.parse(JSON.stringify(p)))?.schema3d).toEqual(p.schema3d);expect(leggiDisegnoCommerciale({...p,schema3d:{altezza:NaN,pendenza:32}})).toBeNull();expect(leggiDisegnoCommerciale({...p,schema3d:{altezza:18,pendenza:90}})).toBeNull();});
});
