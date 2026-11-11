import originale from "./esempi/edificio-3dbag-originale.json";
import {leggiEdificio3d,dalDisegnoAlMondo,uvOrtofoto,type P3} from "./tettoReale";
import {rettangoloNellaFalda,type DisegnoCommercialeFv} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
export const edificio=leggiEdificio3d(originale),falde=edificio.facce.filter(f=>f.tipo==="RoofSurface");
export const puntoFoto=(p:P3)=>{const uv=uvOrtofoto(edificio,p);return{x:uv.u*800,y:(1-uv.v)*800};};
export const puntiFoto=(ps:P3[])=>ps.map(p=>{const s=puntoFoto(p);return`${s.x},${s.y}`;}).join(" ");
export function sagomeOstacoli(piano:DisegnoCommercialeFv){
  return piano.ostacoli.flatMap(o=>{const f=piano.falde.find(f=>rettangoloNellaFalda(o,f,0));return f?[{id:o.id,vertici:[{x:o.x,y:o.y},{x:o.x+o.w,y:o.y},{x:o.x+o.w,y:o.y+o.h},{x:o.x,y:o.y+o.h}].map(p=>dalDisegnoAlMondo(edificio,f.id,p,.08))}]:[];});
}
